import type { Writable } from 'svelte/store'
import type { Observable } from 'dexie'
import type {
  ActionRecordWithId, CreateAccountActionWithId, AccountV0, DebtorDataSource, AccountsMap,
  AckAccountInfoActionWithId, ApproveDebtorNameActionWithId, AccountRecord, AccountDisplayRecord,
  ApproveAmountDisplayActionWithId, ApprovePegActionWithId, KnownAccountData, AccountDataForDisplay,
  CommittedTransferRecord, AccountFullData, ConfigAccountActionWithId
} from './operations'
import type { BaseDebtorData } from './debtor-info'

import equal from 'fast-deep-equal'
import { liveQuery } from 'dexie'
import { writable } from 'svelte/store'
import {
  obtainUserContext, UserContext, AuthenticationError, ServerSessionError, IS_A_NEWBIE_KEY,
  IvalidPaymentData, IvalidPaymentRequest, InvalidCoinUri, DocumentFetchError, RecordDoesNotExist,
  WrongPin, ConflictingUpdate, UnprocessableEntity, CircularPegError, PegDisplayMismatch,
  ResourceNotFound, ServerSyncError, parseCoinUri
} from './operations'
import { calcSmallestDisplayableNumber } from './format-amounts'
import { InvalidDocument } from './debtor-info'

type AttemptOptions = {
  alerts?: [Function, Alert | (() => void)][],
  startInteraction?: boolean,
  waitingDelay?: number,
}

export { IS_A_NEWBIE_KEY }

export const INVALID_REQUEST_MESSAGE = 'Invalid payment request. '
  + 'Make sure that you are scanning the correct QR code, '
  + 'for the correct payment request.'

export const CAN_NOT_PERFORM_ACTOIN_MESSAGE = 'The requested action can not be performed.'

export const WRONG_PIN_MESSAGE = 'A wrong PIN have been entered. '
  + 'Be aware that you have a limited number of attempts to enter '
  + 'the correct PIN, before it gets blocked.'

export const NETWORK_ERROR_MESSAGE = 'A network problem has occured. '
  + 'Please check your Internet connection.'

export const ACTION_DOES_NOT_EXIST_MESSAGE = 'The requested action record does not exist.'

export const INVALID_SCANNED_COIN_MESSAGE = 'Invalid digital coin. '
  + 'Make sure that you are scanning the correct QR code, '
  + 'for the correct digital coin.'

export const INVALID_COIN_MESSAGE = 'Invalid digital coin.'

export const COIN_FETCH_ERROR_MESSAGE = 'Can not read the necessary '
  + 'currency information from the digital coin. This is either a '
  + 'temporary problem, or the digital coin is not correctly set up.'

export const CIRCULAR_PEG_MESSAGE = 'Approving this peg is not possible, because '
  + 'it would create a circular chain of pegs.'

export const PEG_DISPLAY_MISMATCH_MESSAGE = 'The information specified by the issuer '
  + 'of the pegged currency, do not match the available information about '
  + 'the peg currency. First, make sure that you have acknowledged the latest '
  + 'changes in the peg currency. Then, you may try to approve the peg '
  + 'again, or decide to not approve it.'

export const SERVER_SYNC_ERROR_MESSAGE = 'A server error has occured.'

export const UNEXPECTED_ERROR_MESSAGE = 'Oops, something went wrong.'

export type AlertOptions = {
  continue?: () => void,
}

export type ActionManager<T> = {
  currentValue: T,
  markDirty: () => void
  save: () => Promise<void>,
  saveAndClose: () => Promise<void>,
  remove: (back?: () => void) => Promise<void>,
}

let nextAlertId = 1

export class Alert {
  readonly id: number

  constructor(public message: string, public options: AlertOptions = {}) {
    this.id = nextAlertId++
  }
}

export type Store<T> = {
  subscribe(next: (value: T) => void): (() => void)
}

export type PageModel =
  | ActionsModel
  | CreateAccountModel
  | AckAccountInfoModel
  | ApproveDebtorNameModel
  | ApproveAmountDisplayModel
  | OverrideCoinModel
  | ApprovePegModel
  | ConfigAccountModel
  | AccountsModel
  | AccountModel

type BasePageModel = {
  type: string,
  reload: () => void,
  goBack?: () => void,
}

export type ActionsModel = BasePageModel & {
  type: 'ActionsModel',
  actions: Store<ActionRecordWithId[]>,
  scrollTop?: number,
  scrollLeft?: number,
}

export type CreateAccountData = {
  account: AccountV0,
  debtorData: BaseDebtorData,
  debtorDataSource: DebtorDataSource,
  hasDebtorInfo: boolean,
  unit: string,
  amountDivisor: number,
  decimalPlaces: bigint,
}

export type CreateAccountModel = BasePageModel & {
  type: 'CreateAccountModel',
  action: CreateAccountActionWithId | ApprovePegActionWithId,
  createAccountData?: CreateAccountData,
}

export type AckAccountInfoModel = BasePageModel & {
  type: 'AckAccountInfoModel',
  action: AckAccountInfoActionWithId,
  account: AccountV0,
}

export type ApproveDebtorNameModel = BasePageModel & {
  type: 'ApproveDebtorNameModel',
  action: ApproveDebtorNameActionWithId,
  accountRecord: AccountRecord,
  debtorData: BaseDebtorData,
  display: AccountDisplayRecord,
  availableAmount: bigint,
}

export type ApproveAmountDisplayModel = BasePageModel & {
  type: 'ApproveAmountDisplayModel',
  action: ApproveAmountDisplayActionWithId,
  accountRecord: AccountRecord,
  debtorData: BaseDebtorData,
  display: AccountDisplayRecord,
  availableAmount: bigint,
}

export type OverrideCoinModel = BasePageModel & {
  type: 'OverrideCoinModel',
  action: ApprovePegActionWithId,
  createAccountData: CreateAccountData,
  peggedAccountDisplay: AccountDisplayRecord,
}

export type ApprovePegModel = BasePageModel & {
  type: 'ApprovePegModel',
  action: ApprovePegActionWithId,
  pegAccountUri: string,
  pegDebtorName: string,
  peggedAccountDisplay: AccountDisplayRecord,
  exchangeLatestUpdateId: bigint,
}

export type ConfigAccountModel = BasePageModel & {
  type: 'ConfigAccountModel',
  action: ConfigAccountActionWithId,
  accountData: AccountFullData,
  backToAccount: () => void,
  nonstandardDisplay: boolean,
}

export type AccountsModel = BasePageModel & {
  type: 'AccountsModel',
  accounts: AccountDataForDisplay[],
  unnamedAccountUris: string[],
  searchText?: string,
  scrollTop?: number,
  scrollLeft?: number,
}

export type AccountModel = BasePageModel & {
  type: 'AccountModel',
  tab: 'account' | 'coin' | 'ledger' | 'sort',
  scrollTop?: number,
  scrollLeft?: number,
  accountData: AccountFullData,
  sortRank: number,
  transfers: CommittedTransferRecord[],
  fetchTransfers: () => Promise<CommittedTransferRecord[] | undefined>,
}

export const HAS_LOADED_PAYMENT_REQUEST_KEY = 'creditors.hasLoadedPaymentRequest'
export const HAS_SCANNED_DIGITAL_COIN_KEY = 'creditors.hasScannedDigitalCoin'

export const authenticated = writable(true)

export class AppState {
  private interactionId: number = 0
  readonly successfulPinReset: Writable<boolean>
  readonly waitingInteractions: Writable<Set<number>>
  readonly alerts: Writable<Alert[]>
  readonly pageModel: Writable<PageModel>
  goBack?: () => void

  constructor(private uc: UserContext, actions: Store<ActionRecordWithId[]>) {
    this.successfulPinReset = writable(false)
    this.waitingInteractions = writable(new Set())
    this.alerts = writable([])
    this.pageModel = writable({
      type: 'ActionsModel',
      reload: () => { this.showActions() },
      actions,
    })
  }

  get accountsMap(): AccountsMap {
    return this.uc.accountsMap
  }

  fetchDataFromServer(callback?: () => void): Promise<void> {
    let interactionId = this.interactionId
    const executeCallbackAfterUpdate = () => new Promise(resolve => {
      this.uc.scheduleUpdate(() => {
        if (this.interactionId === interactionId) {
          callback?.()
        }
        resolve(undefined)
      })
    })

    return this.attempt(async () => {
      interactionId = this.interactionId
      await this.uc.ensureAuthenticated()
      authenticated.set(true)
      await executeCallbackAfterUpdate()
    }, {
      alerts: [
        [AuthenticationError, () => { }],
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
      ],
    })
  }

  addAlert(alert: Alert): Promise<void> {
    return this.attempt(async () => {
      this.alerts.update(arr => [...arr, alert])
    }, {
      startInteraction: false,
    })
  }

  dismissAlert(alert: Alert): Promise<void> {
    return this.attempt(async () => {
      this.alerts.update(arr => arr.filter(a => !equal(a, alert)))
      alert.options.continue?.()
    }, {
      startInteraction: false,
    })
  }

  resetPin(newPin: string): Promise<void> {
    const retry = () => dispatchEvent(new Event('pin-not-required', { cancelable: true }))

    return this.attempt(async () => {
      await this.uc.resetPin(newPin)
      this.successfulPinReset.set(true)
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: retry })],
      ],
    })
  }

  showActions(back?: () => void): Promise<void> {
    return this.attempt(async () => {
      const goBack = back ?? (() => { this.showActions() })
      const interactionId = this.interactionId
      const actions = await createLiveQuery(() => this.uc.getActionRecords())
      if (this.interactionId === interactionId) {
        this.pageModel.set({
          type: 'ActionsModel',
          reload: () => { this.showActions() },
          goBack,
          actions,
        })
      }
    })
  }

  showAction(actionId: number, back?: () => void): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const action = await this.uc.getActionRecord(actionId)
      if (this.interactionId === interactionId) {
        if (action !== undefined) {
          switch (action.actionType) {
            case 'CreateAccount':
              this.showCreateAccountAction(action, back)
              break
            case 'AckAccountInfo':
              this.showAckAccountInfoAction(action, back)
              break
            case 'ApproveDebtorName':
              this.showApproveDebtorNameAction(action, back)
              break
            case 'ApproveAmountDisplay':
              this.showApproveAmountDisplayAction(action, back)
              break
            case 'ApprovePeg':
              this.showCreateAccountAction(action, back)
              break
            case 'ConfigAccount':
              this.showConfigAccountAction(action, back)
              break
            default:
              throw new Error(`Unknown action type: ${action.actionType}`)
          }
        } else {
          this.addAlert(new Alert(ACTION_DOES_NOT_EXIST_MESSAGE, { continue: () => this.showActions() }))
        }
      }
    })
  }

  createCreateAccountAction(coinUri: string): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const [latestDebtorInfoUri, debtorIdentityUri] = parseCoinUri(coinUri)
      const existingAccountUri = this.accountsMap.getAccountUri(debtorIdentityUri)
      if (existingAccountUri !== undefined) {
        const data = this.accountsMap.getAccountFullData(existingAccountUri)
        if (data?.display.knownDebtor) {
          this.showAccount(existingAccountUri)
          return
        }
      }
      const actionId = await this.uc.createCreateAccountAction(latestDebtorInfoUri, debtorIdentityUri)
      if (this.interactionId === interactionId) {
        this.showAction(actionId)
      }
    }, {
      alerts: [
        [InvalidCoinUri, new Alert(INVALID_SCANNED_COIN_MESSAGE)],
      ],
    })
  }

  showCreateAccountAction(
    action: CreateAccountActionWithId | ApprovePegActionWithId,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const reload = () => { this.showAction(action.actionId, back) }

    const checkAndGoCreateAccount = (createAccountData: CreateAccountData | undefined) => {
      if (this.interactionId === interactionId) {
        this.pageModel.set({ type: 'CreateAccountModel', reload, goBack, action, createAccountData })
      }
    }
    const checkAndGoApprovePeg = (createAccountData: CreateAccountData, peggedAccountData: KnownAccountData) => {
      assert(action.actionType === 'ApprovePeg')
      assert(createAccountData.account.display.debtorName !== undefined)
      if (this.interactionId === interactionId) {
        this.pageModel.set({
          type: 'ApprovePegModel',
          pegAccountUri: createAccountData.account.uri,
          pegDebtorName: createAccountData.account.display.debtorName,
          peggedAccountDisplay: peggedAccountData.display,
          exchangeLatestUpdateId: peggedAccountData.exchange.latestUpdateId,
          reload,
          goBack,
          action,
        })
      }
    }
    const checkAndGoOverrideCoin = (createAccountData: CreateAccountData, peggedAccountData: KnownAccountData) => {
      assert(action.actionType === 'ApprovePeg')
      if (this.interactionId === interactionId) {
        this.pageModel.set({
          type: 'OverrideCoinModel',
          peggedAccountDisplay: peggedAccountData.display,
          reload,
          goBack,
          action,
          createAccountData,
        })
      }
    }
    const getUris = () => action.actionType === 'CreateAccount' ? action : {
      latestDebtorInfoUri: action.peg.latestDebtorInfo.uri,
      debtorIdentityUri: action.peg.debtorIdentity.uri,
    }
    const obtainCreateAccountData = async (): Promise<CreateAccountData> => {
      const { latestDebtorInfoUri, debtorIdentityUri } = getUris()
      const account = await this.uc.ensureAccountExists(debtorIdentityUri)
      assert(account.debtor.uri === debtorIdentityUri)
      const { debtorData, debtorDataSource, hasDebtorInfo } = action.accountCreationState
        ?? await this.uc.obtainBaseDebtorData(account, latestDebtorInfoUri)
      if (
        action.actionType === 'CreateAccount' &&
        debtorDataSource === 'uri' &&
        debtorData.latestDebtorInfo.uri !== latestDebtorInfoUri
      ) {
        throw new InvalidDocument('obsolete debtor info URI')
      }
      const useDisplay = account.display.debtorName !== undefined
      return {
        account,
        debtorData,
        debtorDataSource,
        hasDebtorInfo,
        unit: useDisplay ? (account.display.unit ?? '\u00A4') : debtorData.unit,
        amountDivisor: useDisplay ? account.display.amountDivisor : debtorData.amountDivisor,
        decimalPlaces: useDisplay ? account.display.decimalPlaces : debtorData.decimalPlaces,
      }
    }
    const initializeAccountCreationState = async (data: CreateAccountData): Promise<void> => {
      const { account, debtorData, debtorDataSource, hasDebtorInfo } = data
      const useDisplay = account.display.debtorName !== undefined
      const tinyNegligibleAmount = calcSmallestDisplayableNumber(data.amountDivisor, data.decimalPlaces)
      const editedNegligibleAmount = Math.max(useDisplay ? account.config.negligibleAmount : 0, tinyNegligibleAmount)
      const editedDebtorName = account.display.debtorName ?? debtorData.debtorName
      const accountCreationState = {
        accountUri: data.account.uri,
        accountInitializationInProgress: false,
        confirmed: useDisplay && account.display.knownDebtor,
        debtorData,
        debtorDataSource,
        hasDebtorInfo,
        tinyNegligibleAmount,
        editedDebtorName,
        editedNegligibleAmount,
      }
      await this.uc.replaceActionRecord(action, action = { ...action, accountCreationState })
    }

    return this.attempt(async () => {
      interactionId = this.interactionId
      let createAccountData
      try {
        createAccountData = await obtainCreateAccountData()
        if (action.accountCreationState === undefined) {
          await initializeAccountCreationState(createAccountData)
        }
      } catch (e: unknown) {
        // We can ignore some of the possible errors, because the
        // action page will show an appropriate error message when
        // `createAccountData` is undefined.
        switch (true) {
          case e instanceof InvalidCoinUri:
          case e instanceof DocumentFetchError:
          case e instanceof InvalidDocument:
            assert(createAccountData === undefined)
            assert(action.accountCreationState === undefined)
            break
          default:
            throw e
        }
      }
      const debtorName = createAccountData?.account.display.debtorName
      const knownPegAccount = action.actionType === 'ApprovePeg' && debtorName !== undefined
      const crash_happened_at_the_end_of_previously_started_account_initialization = (
        action.accountCreationState?.accountInitializationInProgress === true &&
        debtorName !== undefined
      )
      if (crash_happened_at_the_end_of_previously_started_account_initialization) {
        await this.uc.finishAccountInitialization(action)
        if (!knownPegAccount) {
          await this.uc.replaceActionRecord(action, null)
          checkAndGoBack()
          return
        }
      }
      if (knownPegAccount) {
        assert(action.actionType === 'ApprovePeg')
        assert(createAccountData !== undefined)
        await this.uc.replaceActionRecord(action, action = { ...action, accountCreationState: undefined })
        const pegAccountUri = createAccountData.account.uri
        const peggedAccountData = await this.uc.validatePeggedAccount(action, pegAccountUri, action.alreadyHasApproval)
        if (!peggedAccountData) {
          await this.uc.replaceActionRecord(action, null)
          checkAndGoBack()
          return
        }
        const coinMismatch = (
          !createAccountData.hasDebtorInfo &&
          createAccountData.debtorDataSource === 'knowledge' &&
          createAccountData.debtorData.latestDebtorInfo.uri !== action.peg.latestDebtorInfo.uri
        )
        if (coinMismatch && !action.ignoreCoinMismatch) {
          checkAndGoOverrideCoin(createAccountData, peggedAccountData)
          return
        }
        checkAndGoApprovePeg(createAccountData, peggedAccountData)
      } else {
        checkAndGoCreateAccount(createAccountData)
      }
    }, {
      // NOTE: After the alert has been acknowledged, we want to be
      // certain that the user will continue to a screen which does
      // not require network connectivity to be shown correctly. The
      // current screen might not be such place. For example, when the
      // user presses the "reload" button, while reviewing a "create
      // account action".
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  approveAccountCreationAction(
    actionManager: ActionManager<CreateAccountActionWithId | ApprovePegActionWithId>,
    data: CreateAccountData,
    pin: string,
    knownDebtor: boolean,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      assert(action.accountCreationState !== undefined)
      interactionId = this.interactionId
      await saveActionPromise
      const isNewAccount = data.account.display.debtorName === undefined
      const crash_happened_at_the_end_of_previously_started_account_initialization = (
        action.accountCreationState.accountInitializationInProgress &&
        !isNewAccount
      )
      if (crash_happened_at_the_end_of_previously_started_account_initialization) {
        await this.uc.finishAccountInitialization(action)
      } else if (isNewAccount) {
        await this.uc.initializeNewAccount(action, data.account, knownDebtor, pin)
      } else {
        await this.uc.confirmKnownAccount(action, data.account, pin, knownDebtor)
      }
      if (action.actionType === 'CreateAccount') {
        await this.uc.replaceActionRecord(action, null)
        if (this.interactionId === interactionId) {
          this.showAccount(data.account.uri)
        }
      } else {
        // The action type is `ApprovePeg`. The peg account creation
        // was only the first stage of the action, now the user should
        // continue with the approval of the peg.
        if (this.interactionId === interactionId) {
          this.showAction(action.actionId, back)
        }
      }
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ResourceNotFound, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE, { continue: checkAndGoBack })],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  showAckAccountInfoAction(action: AckAccountInfoActionWithId, back?: () => void): Promise<void> {
    let interactionId: number
    let account: AccountV0 | undefined
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }

    return this.attempt(async () => {
      interactionId = this.interactionId
      account = await this.uc.getAccount(action.accountUri)
      if (
        account &&
        account.display.debtorName !== undefined &&
        account.knowledge.latestUpdateId === action.knowledgeUpdateId
      ) {
        if (this.interactionId === interactionId) {
          this.pageModel.set({
            type: 'AckAccountInfoModel',
            reload: () => { this.showAction(action.actionId, back) },
            goBack,
            action,
            account,
          })
        }
      } else {
        await this.uc.replaceActionRecord(action, null)
        checkAndGoBack()
      }
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  acknowlegeAckAccountInfoAction(
    action: AckAccountInfoActionWithId,
    account: AccountV0,
    pinForPegRemoval: string | undefined,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }

    return this.attempt(async () => {
      interactionId = this.interactionId
      if (pinForPegRemoval !== undefined) {
        await this.uc.removePeg(account.exchange, pinForPegRemoval)
      }
      await this.uc.replaceActionRecord(action, action = { ...action, acknowledged: true })
      await this.uc.updateAccountKnowledge(action, account)
      assert(await this.uc.getActionRecord(action.actionId) === undefined)
      checkAndGoBack()
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ResourceNotFound, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE, { continue: checkAndGoBack })],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  showApproveDebtorNameAction(action: ApproveDebtorNameActionWithId, back?: () => void): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }

    return this.attempt(async () => {
      interactionId = this.interactionId
      const data = await this.uc.getKnownAccountData(action.accountUri)
      if (
        data &&
        data.debtorData.debtorName === action.debtorName
      ) {
        if (this.interactionId === interactionId) {
          this.pageModel.set({
            type: 'ApproveDebtorNameModel',
            reload: () => { this.showAction(action.actionId, back) },
            accountRecord: data.account,
            debtorData: data.debtorData,
            display: data.display,
            availableAmount: data.ledger.principal,
            goBack,
            action,
          })
        }
      } else {
        await this.uc.replaceActionRecord(action, null)
        checkAndGoBack()
      }
    }, {
      alerts: [
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  resolveApproveDebtorNameAction(
    actionManager: ActionManager<ApproveDebtorNameActionWithId>,
    displayLatestUpdateId: bigint,
    pin: string,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      await this.uc.resolveApproveDebtorNameAction(action, displayLatestUpdateId, pin)
      checkAndGoBack()
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE)],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE)],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ResourceNotFound, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  showApproveAmountDisplayAction(action: ApproveAmountDisplayActionWithId, back?: () => void): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }

    const initializeActionState = async (): Promise<void> => {
      const tinyNegligibleAmount = calcSmallestDisplayableNumber(action.amountDivisor, action.decimalPlaces)
      const state = {
        approved: 'yes' as const,
        editedNegligibleAmount: tinyNegligibleAmount,
        tinyNegligibleAmount,
      }
      await this.uc.replaceActionRecord(action, action = { ...action, state })
    }

    return this.attempt(async () => {
      interactionId = this.interactionId
      const data = await this.uc.getKnownAccountData(action.accountUri)
      if (
        data &&
        data.debtorData.amountDivisor === action.amountDivisor &&
        data.debtorData.decimalPlaces === action.decimalPlaces &&
        data.debtorData.unit === action.unit &&
        !(
          action.amountDivisor === data.display.amountDivisor &&
          action.decimalPlaces === data.display.decimalPlaces &&
          action.unit === data.display.unit
        )
      ) {
        if (action.state === undefined) {
          await initializeActionState()
        }
        if (this.interactionId === interactionId) {
          this.pageModel.set({
            type: 'ApproveAmountDisplayModel',
            reload: () => { this.showAction(action.actionId, back) },
            accountRecord: data.account,
            debtorData: data.debtorData,
            display: data.display,
            availableAmount: data.ledger.principal,
            goBack,
            action,
          })
        }
      } else {
        await this.uc.replaceActionRecord(action, null)
        checkAndGoBack()
      }
    }, {
      alerts: [
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  resolveApproveAmountDisplayAction(
    actionManager: ActionManager<ApproveAmountDisplayActionWithId>,
    displayLatestUpdateId: bigint,
    pin: string,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      await this.uc.resolveApproveAmountDisplayAction(action, displayLatestUpdateId, pin)
      checkAndGoBack()
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE)],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE)],
        [ServerSyncError, new Alert(SERVER_SYNC_ERROR_MESSAGE)],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ResourceNotFound, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  resolveApprovePegAction(
    actionManager: ActionManager<ApprovePegActionWithId>,
    approve: boolean,
    pegAccountUri: string,
    exchangeLatestUpdateId: bigint,
    pin: string | undefined,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      await this.uc.resolveApprovePegAction(action, approve, pegAccountUri, exchangeLatestUpdateId, pin)
      checkAndGoBack()
    }, {
      alerts: [
        [CircularPegError, new Alert(CIRCULAR_PEG_MESSAGE)],
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE)],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE)],
        [ServerSyncError, new Alert(SERVER_SYNC_ERROR_MESSAGE)],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [ResourceNotFound, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
        [PegDisplayMismatch, new Alert(PEG_DISPLAY_MISMATCH_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  resolveCoinConflict(
    actionManager: ActionManager<ApprovePegActionWithId>,
    replace: boolean,
    pegAccountUri: string,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      const ackAccountInfoActionId = await this.uc.resolveCoinConflict(action, replace, pegAccountUri)
      if (this.interactionId === interactionId) {
        this.showAction(ackAccountInfoActionId ?? action.actionId)
      }
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
        [DocumentFetchError, new Alert(COIN_FETCH_ERROR_MESSAGE)],
        [InvalidDocument, new Alert(COIN_FETCH_ERROR_MESSAGE)],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  showConfigAccountAction(action: ConfigAccountActionWithId, back?: () => void): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const showActions = () => { this.showActions() }

    const detectNonstandardAmountDisplay = async (accountData: AccountFullData) => {
      const { amountDivisor, decimalPlaces, unit } = accountData.debtorData
      const display = accountData.display
      let nonstandard = !(
        display.amountDivisor === amountDivisor &&
        display.decimalPlaces === decimalPlaces &&
        display.unit === unit
      )
      if (nonstandard) {
        // When the current amount display is nonstandard, but there
        // is a corresponding "approve amount display" action, we
        // consider this "good enough".
        const actions = await this.uc.getActionRecords()
        nonstandard = !actions.some(a => (
          a.actionType === 'ApproveAmountDisplay' &&
          a.accountUri === action.accountUri &&
          a.amountDivisor === amountDivisor &&
          a.decimalPlaces === decimalPlaces &&
          a.unit === unit
        ))
      }
      return nonstandard
    }

    return this.attempt(async () => {
      interactionId = this.interactionId
      const accountData = this.accountsMap.getAccountFullData(action.accountUri)
      if (accountData) {
        const nonstandardDisplay = await detectNonstandardAmountDisplay(accountData)
        if (this.interactionId === interactionId) {
          this.pageModel.set({
            type: 'ConfigAccountModel',
            reload: () => { this.showAction(action.actionId, back) },
            goBack: showActions,
            backToAccount: goBack,
            action,
            accountData,
            nonstandardDisplay,
          })
        }
      } else {
        await this.uc.replaceActionRecord(action, null)
        checkAndGoBack()
      }
    }, {
      alerts: [
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndGoBack })],
      ],
    })
  }

  executeConfigAccountAction(
    actionManager: ActionManager<ConfigAccountActionWithId>,
    accountData: AccountFullData,
    pin: string,
    back?: () => void,
  ): Promise<void> {
    let interactionId: number
    const goBack = back ?? (() => { this.showActions() })
    const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
    const checkAndShowActions = () => { if (this.interactionId === interactionId) this.showActions() }
    const saveActionPromise = actionManager.saveAndClose()
    let action = actionManager.currentValue

    return this.attempt(async () => {
      interactionId = this.interactionId
      await saveActionPromise
      await this.uc.executeConfigAccountAction(
        action,
        accountData.display.latestUpdateId,
        accountData.config.latestUpdateId,
        pin,
      )
      checkAndGoBack()
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
        [WrongPin, new Alert(WRONG_PIN_MESSAGE)],
        [UnprocessableEntity, new Alert(WRONG_PIN_MESSAGE)],
        [ConflictingUpdate, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndShowActions })],
        [ResourceNotFound, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndShowActions })],
        [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: checkAndShowActions })],
      ],
    })
  }

  showAccounts(): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const accounts = await this.uc.getAccountsDataForDisplay()
      const unnamedAccountUris = this.accountsMap.getUnnamedAccountUris()
      if (this.interactionId === interactionId) {
        this.pageModel.set({
          type: 'AccountsModel',
          reload: () => { this.showAccounts() },
          goBack: () => { this.showActions() },
          accounts,
          unnamedAccountUris,
        })
      }
    })
  }

  async deleteUnnamedAccountUris(uris: string[]): Promise<void> {
    let interactionId: number
    const checkAndShowAcounts = () => { if (this.interactionId === interactionId) this.showAccounts() }

    return this.attempt(async () => {
      interactionId = this.interactionId
      this.uc.deleteUnnamedAccounts(uris)
      let resolveUpdatePromise
      const updatePromise = new Promise(resolve => { resolveUpdatePromise = resolve })
      this.uc.scheduleUpdate(resolveUpdatePromise)
      await updatePromise
      checkAndShowAcounts()
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
      ],
    })
  }

  async showAccount(accountUri: string, back?: () => void): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const goBack = back ?? (() => { this.showAccounts() })
      const sortRank = await this.uc.getAccountSortPriority(accountUri)
      const accountData = this.accountsMap.getAccountFullData(accountUri)
      if (this.interactionId === interactionId) {
        if (accountData === undefined) {
          this.showAccounts()
        } else {
          // TODO: Add a real implementation.
          const sleep = (milliseconds: number) => {
            return new Promise(resolve => setTimeout(resolve, milliseconds))
          }
          const dummyTransfers: CommittedTransferRecord[] = Array(40).fill({
            type: 'CommittedTransfer',
            uri: '',
            userId: 1,
            account: { uri: '' },
            sender: { type: 'AccountIdentity', uri: '' },
            recipient: { type: 'AccountIdentity', uri: '' },
            acquiredAmount: 1000n,
            noteFormat: '',
            note: 'Pretty simple and straight-forward right? \n\n\n\n ' +
              '`Ivan Ivanov Ivanov` says that this can be used for much ' +
              'more than just setting font-size however, and they can ' +
              'be used pretty much everywhere units are expected (padding' +
              ', margin, width, height, max-width,…you get the picture!).',
            committedAt: '2020-01-01T00:00:00Z',
          })
          this.pageModel.set({
            type: 'AccountModel',
            reload: () => { this.showAccount(accountUri, back) },
            fetchTransfers: async () => {
              // TODO: Get ~100 transfers from the local DB, and if
              // there are not enough of them -- fetch some from the server.
              let transfers: CommittedTransferRecord[] | undefined
              await this.attempt(async () => {
                await sleep(2000)
                if (Math.random() > 0.2) {
                  transfers = dummyTransfers
                } else {
                  throw new ServerSessionError()
                }
              }, {
                alerts: [
                  [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
                ],
              })
              return transfers
            },
            tab: 'account',
            transfers: dummyTransfers,  // TODO: get ~100 transfers from the local DB.
            goBack,
            accountData,
            sortRank,
          })
        }
      }
    })
  }

  async showLedgerEntry(commitedTransferUri: string, back?: () => void): Promise<void> {
    commitedTransferUri
    this.showActions(back)
    // TODO: implement.
  }

  async setAccountSortPriority(uri: string, priority: number): Promise<void> {
    await this.uc.setAccountSortPriority(uri, priority)
  }

  async createConfigAccountAction(accountUri: string, back?: () => void): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      await this.uc.getAccount(accountUri)
      const accountData = this.accountsMap.getAccountFullData(accountUri)
      if (accountData === undefined) {
        this.showAccounts()
        return
      }
      const action = await this.uc.ensureUniqueAccountAction({
        userId: this.uc.userId,
        actionType: 'ConfigAccount',
        createdAt: new Date(),
        editedDebtorName: accountData.display.debtorName,
        editedNegligibleAmount: accountData.config.negligibleAmount,
        editedScheduledForDeletion: accountData.config.scheduledForDeletion,
        editedAllowUnsafeDeletion: accountData.config.allowUnsafeDeletion,
        approveNewDisplay: false,
        accountUri,
      })
      if (this.interactionId === interactionId) {
        this.showAction(action.actionId, back)
      }
    }, {
      alerts: [
        [ServerSessionError, new Alert(NETWORK_ERROR_MESSAGE)],
      ],
    })
  }

  initiatePayment(paymentRequestFile: Blob | Promise<Blob>): Promise<void> {
    return this.attempt(async () => {
      const interactionId = this.interactionId
      const blob = await paymentRequestFile
      const action = await this.uc.processPaymentRequest(blob)
      if (this.interactionId === interactionId) {
        this.showAction(action.actionId)
      }
    }, {
      alerts: [
        [IvalidPaymentRequest, new Alert(INVALID_REQUEST_MESSAGE)],
        [IvalidPaymentData, new Alert(INVALID_REQUEST_MESSAGE)],
      ],
    })
  }

  /** Create an action manager instance. The action manager queues the
   * consequent asynchronous updates of the action. This is useful in
   * forms/dialogs that may modify the action, and then trigger the
   * execution of the action.
   */
  createActionManager<T extends ActionRecordWithId>(action: T, createModifiedValue = () => action): ActionManager<T> {
    let updatePromise = Promise.resolve()
    let latestValue = action
    let isDirty = false
    let isClosed = false

    const ignoreRecordDoesNotExistErrors = (error: unknown) => {
      if (error instanceof RecordDoesNotExist) {
        console.log('A "RecordDoesNotExist" error has occured during saving.')
        return Promise.resolve()
      } else {
        return Promise.reject(error)
      }
    }
    const store = async (value: T): Promise<void> => {
      await updatePromise
      if (!equal(action, value)) {
        assert(action.actionId === value.actionId)
        assert(action.actionType === value.actionType)
        await this.uc.replaceActionRecord(action, action = value)
      }
    }
    const markDirty = (): void => {
      if (!isDirty) {
        isDirty = true
        addEventListener('beforeunload', save, { capture: true })
        setTimeout(save, 5000)
      }
    }
    const save = (): Promise<void> => {
      if (!isClosed) {
        latestValue = createModifiedValue()
        updatePromise = store(latestValue).catch(ignoreRecordDoesNotExistErrors)
        isDirty = false
      }
      removeEventListener('beforeunload', save, { capture: true })
      return updatePromise
    }
    const saveAndClose = (): Promise<void> => {
      const savePromise = save()
      isClosed = true
      return savePromise
    }
    const remove = async (back?: () => void): Promise<void> => {
      let interactionId: number
      const goBack = back ?? (() => { this.showActions() })
      const checkAndGoBack = () => { if (this.interactionId === interactionId) goBack() }
      const reloadAction = () => {
        if (this.interactionId === interactionId) {
          this.showAction(action.actionId)
        }
      }
      return this.attempt(async () => {
        interactionId = this.interactionId
        await store(latestValue)
        await this.uc.replaceActionRecord(latestValue, null)
        checkAndGoBack()
      }, {
        alerts: [
          [RecordDoesNotExist, new Alert(CAN_NOT_PERFORM_ACTOIN_MESSAGE, { continue: reloadAction })],
        ],
      })
    }

    return {
      get currentValue() { return latestValue },
      markDirty,
      save,
      saveAndClose,
      remove,
    }
  }

  /* Awaits `func()`, catching and logging thrown
   * errors. `options.alerts` determines what alert should be shown on
   * what error. `option.startInteraction` determines whether a
   * hourglass should be shown when the operation had not been
   * completed after some time. */
  private async attempt(func: () => unknown, options: AttemptOptions = {}): Promise<void> {
    const { alerts = [], startInteraction = true, waitingDelay = 250 } = options

    const addWaitingInteraction = () => {
      this.waitingInteractions.update(originalSet => {
        const updatedSet = new Set(originalSet)
        updatedSet.add(interactionId)
        return updatedSet
      })
      addedWaitingInteraction = true
    }
    const clearWaitingInteraction = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
      if (addedWaitingInteraction) {
        this.waitingInteractions.update(originalSet => {
          const updatedSet = new Set(originalSet)
          updatedSet.delete(interactionId)
          return updatedSet
        })
      }
    }
    const alertFromError = (error: unknown): Alert | (() => void) | undefined => {
      for (const [errorConstructor, alert] of alerts) {
        if (error instanceof errorConstructor) {
          return alert
        }
      }
      return undefined
    }

    let addedWaitingInteraction = false
    let timeoutId: any
    let interactionId: number
    if (startInteraction) {
      interactionId = ++this.interactionId
      if (waitingDelay > 0) {
        timeoutId = setTimeout(addWaitingInteraction, waitingDelay)
      } else {
        addWaitingInteraction()
      }
    } else {
      interactionId = this.interactionId
    }

    try {
      await func()
    } catch (e: unknown) {
      const alert = alertFromError(e)
      if (alert === undefined) {
        console.error(e)
        this.addAlert(new Alert(UNEXPECTED_ERROR_MESSAGE))
        throw e
      } else if (typeof alert === 'function') {
        alert()
      } else {
        this.addAlert(alert)
      }
    } finally {
      clearWaitingInteraction()
    }
  }
}

/* Returns a promise for an object that satisfies Svelte's store
 * contract. Svelte stores are required to call the `onNext` method
 * synchronously, but observables are not required to do so. This
 * function awaits for the first value on the observable to appear, so
 * that the created store can return it on subscription. */
export async function createStore<T>(observable: Observable<T>): Promise<Store<T>> {
  let onNext: any
  let onError: any
  const valuePromise = new Promise<T>((resolve, reject) => {
    onNext = resolve
    onError = reject
  })
  const subscription = observable.subscribe(onNext, onError, () => onError(new Error('no value')))
  let currentValue: T = await valuePromise
  subscription.unsubscribe()

  return {
    subscribe(next) {
      let called = false
      const callNext = (value: T) => {
        if (!(called && currentValue === value)) {
          next(currentValue = value)
          called = true
        }
      }
      const subscription = observable.subscribe(callNext, error => { console.error(error) })
      callNext(currentValue)
      return subscription.unsubscribe
    }
  }
}

export function createLiveQuery<T>(querier: () => T | Promise<T>): Promise<Store<T>> {
  return createStore(liveQuery(querier))
}

export async function createAppState(): Promise<AppState | undefined> {
  const uc = await obtainUserContext()
  if (uc) {
    const actions = await createLiveQuery(() => uc.getActionRecords())
    return new AppState(uc, actions)
  }
  return undefined
}
