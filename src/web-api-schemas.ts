export type CreditorReservationRequest = {
  /** The type of this object. */
  type?: string;
}

export type CreditorReservation = {
  /** The moment at which the reservation was created. */
  createdAt: string;

  /** The reserved creditor ID. */
  creditorId: string;

  /** The type of this object. */
  type: string;

  /** The moment at which the reservation will expire. */
  validUntil: string;

  /** A number that will be needed in order to activate the
   * creditor. */
  reservationId: bigint;
}

export type Error = {
  /** Error code */
  code?: number;

  /** Error name */
  status?: string;

  /** Error message */
  message?: string;

  /** Errors */
  errors?: { [key: string]: unknown };
}

export type CreditorsList = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The type of the items in the paginated list. */
  itemsType: string;

  /** The type of this object. */
  type: string;

  /** The URI of the first page in the paginated list. This can be a
   * relative URI. The object retrieved from this URI will have: 1) An
   * `items` field (an array), which will contain the first items of
   * the paginated list; 2) May have a `next` field (a string), which
   * would contain the URI of the next page in the list. */
  first: string;
}

export type ObjectReference = {
  /** The URI of the object. Can be a relative URI. */
  uri: string;
}

export type ObjectReferencesPage = {
  /** An array of `ObjectReference`s. Can be empty. */
  items: ObjectReference[];

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The type of this object. */
  type: string;

  /** An URI of another `ObjectReferencesPage` object which contains
   * more items. When there are no remaining items, this field will
   * not be present. If this field is present, there might be
   * remaining items, even when the `items` array is empty. This can
   * be a relative URI. */
  next?: string;
}

export type CreditorActivationRequest = {
  /** When this field is present, the server will try to activate an
   * existing reservation with matching `creditorID` and
   * `reservationID`. When this field is not present, the server will
   * try to reserve the creditor ID specified in the path, and
   * activate it at once. */
  reservationId?: bigint;

  /** The type of this object. */
  type?: string;
}

export type Creditor = {
  /** The moment at which the creditor was created. */
  createdAt: string;

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** The type of this object. */
  type?: string;

  /** The URI of the creditor's `Wallet`. */
  wallet: ObjectReference;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type CreditorDeactivationRequest = {
  /** The type of this object. */
  type?: string;
}

export type PaginatedStream = {
  /** The type of the items in the paginated stream. */
  itemsType: string;

  /** The type of this object. */
  type: string;

  /** An URI for obtaining items that might be added to the paginated
   * stream in the future. This is useful when the client wants to
   * skip all items currently in the stream, but to follow the
   * forthcoming stream of new items. The object retrieved from this
   * URI will be of the same type as the one retrieved from the
   * `first` field. This can be a relative URI. */
  forthcoming: string;

  /** The URI of the first page in the paginated stream. This can be a
   * relative URI. The object retrieved from this URI will have: 1) An
   * `items` field (an array), which will contain the first items of
   * the paginated stream; 2) May have a `next` field (a string),
   * which would contain the URI of the next page in the stream; 3) If
   * the `next` field is not present, will have a `forthcoming` field,
   * for obtaining items that might be added to the stream in the
   * future. */
  first: string;
}

export type Wallet = {
  /** The URI of creditor's `AccountsList`. That is: an URI of a
   * `PaginatedList` of `ObjectReference`s to all `Account`s belonging
   * to the creditor. The paginated list will not be sorted in any
   * particular order. */
  accountsList: ObjectReference;

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /**
   * Whether the PIN is required for potentially dangerous operations.
   *
   * Note: The PIN will never be required when in "PIN reset" mode.
   */
  requirePin: boolean;

  /** The URI of creditor's `TransfersList`. That is: an URI of a
   * `PaginatedList` of `ObjectReference`s to all `Transfer`s
   * initiated by the creditor, which have not been deleted yet. The
   * paginated list will not be sorted in any particular order. */
  transfersList: ObjectReference;

  /** The type of this object. */
  type: string;

  /** The URI of the `Creditor`. */
  creditor: ObjectReference;

  /** A URI to which a `DebtorIdentity` object can be POST-ed, trying
   * to find an existing account with this debtor. If an existing
   * account is found, the response will redirect to the `Account`
   * (response code 303). Otherwise, the response will be empty
   * (response code 204). */
  debtorLookup: ObjectReference;

  /** A `PaginatedStream` of creditor's `LogEntry`s. The paginated
   * stream will be sorted in chronological order (smaller entry IDs
   * go first). The main purpose of the log stream is to allow the
   * clients of the API to reliably and efficiently invalidate their
   * caches, simply by following the "log". */
  log: PaginatedStream;

  /** The URI of creditor's `PinInfo`. */
  pinInfo: ObjectReference;

  /** The entries in the creditor's log stream will not be deleted for
   * at least this number of days. This will always be a positive
   * number. */
  logRetentionDays: bigint;

  /** The ID of the latest entry in the creditor's log stream. If
   * there are no entries yet, the value will be 0. */
  logLatestEntryId: bigint;

  /** A URI to which the recipient account's `AccountIdentity` can be
   * POST-ed, trying to find the identify of the account's debtor. If
   * the debtor has been identified successfully, the response will
   * contain the debtor's `DebtorIdentity`. Otherwise, the response
   * code will be 422. */
  accountLookup: ObjectReference;

  /** A URI to which a `TransferCreationRequest` can be POST-ed to
   * create a new `Transfer`. */
  createTransfer: ObjectReference;

  /** A URI to which a `DebtorIdentity` object can be POST-ed to
   * create a new `Account`. */
  createAccount: ObjectReference;
}

export type PinInfo = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /**
   * The status of the PIN.
   *
   * `"off"` means that the PIN is not required for potentially dangerous operations.
   * `"on"` means that the PIN is required for potentially dangerous operations.
   * `"blocked"` means that the PIN has been blocked.
   */
  status: string;

  /** The new PIN. When `status` is "on", this field must be
   * present. Note that when changing the PIN, the `pin` field should
   * contain the old PIN, and the `newPin` field should contain the
   * new PIN. */
  newPin?: string;

  /** The type of this object. */
  type?: string;

  /**
   * Optional PIN (Personal Identification Number).
   *
   * Note: This field must be present when the PIN is required for
   * potentially dangerous operations. In such cases, if the passed
   * value is incorrect, the operation will fail. After several such
   * failed attempts, the creditor's PIN will be blocked.
   */
  pin?: string;

  /** The URI of the creditor's `Wallet`. */
  wallet: ObjectReference;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type LogEntry = {
  /** The URI of the object that has been created, updated, or
   * deleted. */
  object: ObjectReference;

  /** The type of this object. */
  type: string;

  /** The type of the object that has been created, updated, or
   * deleted. */
  objectType: string;

  /** The ID of the log entry. This will always be a positive
   * number. The first log entry has an ID of `1`, and the ID of each
   * subsequent log entry will be equal to the ID of the previous log
   * entry plus one. */
  entryId: bigint;

  /** Whether the object has been deleted. */
  deleted: boolean;

  /** The moment at which the entry was added to the log. */
  addedAt: string;

  /**
   * Optional information about the new state of the created/updated
   * object. When present, this information can be used to avoid
   * making a network request to obtain the new state. What properties
   * the "data" object will have, depends on the value of the
   * `objectType` field:
   *
   * # When the object type is "AccountLedger"
   *
   * `principal` and `nextEntryId` properties will  be present.
   *
   * # When the object type is "Transfer"
   *
   * If the transfer is finalized, `finalizedAt` and (only when there
   * is an error) `errorCode` properties will be present. If the
   * transfer is not finalized, the "data" object will not be present.
   *
   * Note: This field will never be present when the object has been
   * deleted.
   */
  data?: { [key: string]: unknown };

  /** A positive number which gets incremented after each change in
   * the object. When this field is not present, this means that the
   * changed object does not have an update ID (the object is
   * immutable, or has been deleted, for example). */
  objectUpdateId?: bigint;
}

export type LogEntriesPage = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** An URI of another `LogEntriesPage` object which would contain
   * items that might be added in the future. That is: items that are
   * not currently available, but may become available in the
   * future. This is useful when we want to follow a continuous stream
   * of log entries. This field will not be present if, and only if,
   * the `next` field is present. This can be a relative URI. */
  forthcoming?: string;

  /** The type of this object. */
  type: string;

  /** An URI of another `LogEntriesPage` object which contains more
   * items. When there are no remaining items, this field will not be
   * present. If this field is present, there might be remaining
   * items, even when the `items` array is empty. This can be a
   * relative URI. */
  next?: string;

  /** An array of `LogEntry`s. Can be empty. */
  items: LogEntry[];
}

export type AccountsList = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** The URI of the first page in the paginated list. This can be a
   * relative URI. The object retrieved from this URI will have: 1) An
   * `items` field (an array), which will contain the first items of
   * the paginated list; 2) May have a `next` field (a string), which
   * would contain the URI of the next page in the list. */
  first: string;

  /** The type of this object. */
  type: string;

  /** The type of the items in the paginated list. */
  itemsType: string;

  /** The URI of the creditor's `Wallet` that contains the accounts
   * list. */
  wallet: ObjectReference;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type TransfersList = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** The URI of the first page in the paginated list. This can be a
   * relative URI. The object retrieved from this URI will have: 1) An
   * `items` field (an array), which will contain the first items of
   * the paginated list; 2) May have a `next` field (a string), which
   * would contain the URI of the next page in the list. */
  first: string;

  /** The type of this object. */
  type: string;

  /** The type of the items in the paginated list. */
  itemsType: string;

  /** The URI of the creditor's `Wallet` that contains the transfers
   * list. */
  wallet: ObjectReference;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type AccountIdentity = {
  /**
   * The information contained in this field must be enough to: 1)
   * uniquely and reliably identify the debtor, 2) uniquely and
   * reliably identify the creditor's account with the debtor. Note
   * that a network request *should not be needed* to identify the
   * account.
   *
   * For example, if the debtor happens to be a bank, the URI would
   * reveal the type of the debtor (a bank), the ID of the bank, and
   * the bank account number.
   */
  uri: string;

  /** The type of this object. */
  type?: string;
}

export type DebtorIdentity = {
  /**
   * The information contained in this field must be enough to
   * uniquely and reliably identify the debtor. Note that a network
   * request *should not be needed* to identify the debtor.
   *
   * For example, if the issuer happens to be a bank, the URI would
   * reveal the type of the issuer (a bank), the ID of the bank, and
   * the currency code (USD for example). Note that some debtors may
   * be used only to represent a physical value measurement unit (like
   * ounces of gold). Those *dummy debtors* do not represent a person
   * or an organization, do not owe anything to anyone, and are used
   * solely as identifiers of value measurement units.
   */
  uri: string;

  /** The type of this object. */
  type?: string;
}

export type DebtorInfo = {
  /** Optional SHA-256 cryptographic hash (Base16 encoded) of the
   * content of the document that the `iri` field refers to. */
  sha256?: string;

  /** Optional MIME type of the document that the `iri` field refers
   * to. */
  contentType?: string;

  /** The type of this object. */
  type?: string;

  /** A link (Internationalized Resource Identifier) referring to a
   * document containing information about the debtor. */
  iri: string;
}

export type AccountKnowledge = {
  /** Optional moment at which the latest change in the interest rate
   * has happened, which is known to the creditor. */
  interestRateChangedAt?: string;

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** The type of this object. */
  type?: string;

  /** The URI of the corresponding `Account`. */
  account: ObjectReference;

  /** Optional debtor data, which is known to the creditor. Basically,
   * this is a "application/vnd.swaptacular.coin-info+json" document,
   * from which `type`, `debtorIdentity`, and `revision` fields have
   * been removed. This is AN EXTENSION TO THE STANDARD WEB-API.
   */
  debtorData?: unknown;  // BaseDebtorData

  /** Optional configuration error, which is known to the creditor. */
  configError?: string;

  /** Optional `AccountIdentity`, which is known to the creditor. */
  identity?: AccountIdentity;

  /** Optional annual account interest rate (in percents), which is
   * known to the creditor. */
  interestRate?: number;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;

  /** Optional maximal number of bytes that transfer notes are allowed
   * to contain when UTF-8 encoded, which is known to the creditor. */
  noteMaxBytes?: bigint;
}

export type AccountInfo = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** Annual rate (in percents) at which interest accumulates on the
   * account. */
  interestRate: number;

  /**
   * Account's `AccountIdentity`. It uniquely and reliably identifies
   * the account when it participates in transfers as sender or
   * recipient. When this field is not present, this means that the
   * account does not have an identity yet (or anymore), and can not
   * participate in transfers.
   *
   * Note: This field will not be present at all for *dummy
   * accounts*. Dummy accounts can be useful for two purposes: 1) They
   * can represent physical value measurement units (like ounces of
   * gold), to which debtors can peg their currencies; 2) They can
   * represent accounts with debtors to which no network connection is
   * available, still allowing those accounts to act as links in a
   * chain of currency pegs.
   */
  identity?: AccountIdentity;

  /** The type of this object. */
  type: string;

  /** The maximal number of bytes that transfer notes are allowed to
   * contain when UTF-8 encoded. This will be a non-negative
   * number. */
  noteMaxBytes: bigint;

  /** Whether it is safe to delete this account. */
  safeToDelete: boolean;

  /** Optional information about the debtor. */
  debtorInfo?: DebtorInfo;

  /** The moment at which the latest change in the interest rate
   * happened. */
  interestRateChangedAt: string;

  /** The URI of the corresponding `Account`. */
  account: ObjectReference;

  /**
   * When this field is present, this means that for some reason, the
   * current `AccountConfig` settings can not be applied, or are not
   * effectual anymore. Usually this means that there has been a
   * network communication problem, or a system configuration
   * problem. The value alludes to the cause of the problem.
   *
   * `"NO_CONNECTION_TO_DEBTOR"` signifies that there is no network
   * connection to the account's debtor. Note that the account may
   * still be useful as a link in a chain of currency pegs.
   *
   * `"CONFIGURATION_IS_NOT_EFFECTUAL"` signifies that the necessary
   * confirmation that the current configuration settings have been
   * successfully applied has not been received.
   */
  configError?: string;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type CurrencyPeg = {
  /** The type of this object. */
  type?: string;

  /** The exchange rate between the pegged currency and the peg
   * currency. For example, `2.0` would mean that pegged currency's
   * tokens are twice as valuable as peg currency's tokens. */
  exchangeRate: number;

  /** The URI of the peg currency's `Account`. */
  account: ObjectReference;
}

export type AccountExchange = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** Optional `CurrencyPeg`. A currency peg is an exchange strategy
   * in which the creditor sets a specific fixed exchange rate between
   * the tokens of two of his accounts (the pegged currency, and the
   * peg currency). Sometimes the peg currency is itself pegged to
   * another currency. This is called a "peg-chain". */
  peg?: CurrencyPeg;

  /** The type of this object. */
  type?: string;

  /**
   * Optional PIN (Personal Identification Number).
   *
   * Note: This field must be present when the PIN is required for
   * potentially dangerous operations. In such cases, if the passed
   * value is incorrect, the operation will fail. After several such
   * failed attempts, the creditor's PIN will be blocked.
   */
  pin?: string;

  /**
   * The principal amount on the account should not fall below this
   * value. Note that this limit applies only for automatic exchanges,
   * and is enforced on "best effort" bases.
   *
   * Note: For new accounts the value of this field will be
   * `-9223372036854775808`.
   */
  minPrincipal: bigint;

  /** The URI of the corresponding `Account`. */
  account: ObjectReference;

  /**
   * The principal amount on the account should not exceed this
   * value. Note that this limit applies only for automatic exchanges,
   * and is enforced on "best effort" bases. The value of this field
   * must be greater or equal than the value of the `minPrincipal`
   * field.
   *
   * Note: For new accounts the value of this field will be
   * `9223372036854775807`.
   */
  maxPrincipal: bigint;

  /**
   * The name of the automatic exchange policy. If this field is not
   * present, this means that the account will not participate in
   * automatic exchanges.
   *
   * `"conservative"` is the most straightforward exchange policy. It
   * tries to make the *mimimal exchange* that would bring account's
   * principal between `minPrincipal` and `maxPrincipal`, or if this
   * is not possible, it tries to bring the principal as close as
   * possible to that interval.
   *
   * Note: Different implementations may define additional exchange
   * policies.
   */
  policy?: string;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type AccountConfig = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /**
   * Whether unsafe deletion of the account is allowed by the
   * creditor. Note that the deletion of an account which allows
   * unsafe deletion may result in losing a non-negligible amount of
   * money on the account.
   *
   * Note: For new accounts the value of this field will be `False`.
   */
  allowUnsafeDeletion: boolean;

  /** The type of this object. */
  type?: string;

  /**
   * Optional PIN (Personal Identification Number).
   *
   * Note: This field must be present when the PIN is required for
   * potentially dangerous operations. In such cases, if the passed
   * value is incorrect, the operation will fail. After several such
   * failed attempts, the creditor's PIN will be blocked.
   */
  pin?: string;

  /**
   * The maximum amount that is considered negligible. It can be used
   * to decide whether the account can be safely deleted, and whether
   * an incoming transfer should be considered as insignificant. Must
   * be non-negative.
   *
   * Note: For new accounts the value of this field will be `1e30`.
   */
  negligibleAmount: number;

  /** The URI of the corresponding `Account`. */
  account: ObjectReference;

  /**
   * Whether the account is scheduled for deletion. The safest way to
   * delete an account whose status (`AccountInfo`) indicates that
   * deletion is not safe, is to first schedule it for deletion, and
   * delete it only when the account status indicates that deletion is
   * safe. Note that this may also require making outgoing transfers,
   * so as to reduce the balance on the account to a negligible
   * amount.
   *
   * Note: For new accounts the value of this field will be `False`.
   */
  scheduledForDeletion: boolean;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type PaginatedList = {
  /** The type of the items in the paginated list. */
  itemsType: string;

  /** The type of this object. */
  type: string;

  /** The URI of the first page in the paginated list. This can be a
   * relative URI. The object retrieved from this URI will have: 1) An
   * `items` field (an array), which will contain the first items of
   * the paginated list; 2) May have a `next` field (a string), which
   * would contain the URI of the next page in the list. */
  first: string;
}

export type AccountLedger = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** The type of this object. */
  type: string;

  /**
   * The approximate amount of interest accumulated on the account,
   * which has not been added to the principal yet. This can be a
   * negative number. Once in a while, the accumulated interest will
   * be zeroed out and added to the principal (an interest payment).
   *
   * Note: The value of this field is calculated on-the-fly, so it may
   * change from one request to another, and no `LogEntry` for the
   * change will be added to the log.
   */
  interest: bigint;

  /** The `entryID` of the next ledger entry to come. This will always
   * be a positive number. The first ledger entry for each account
   * will have an ID of `1`, and the ID of each subsequent ledger
   * entry will be equal to the ID of the previous ledger entry plus
   * one. */
  nextEntryId: bigint;

  /** The URI of the corresponding `Account`. */
  account: ObjectReference;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;

  /** The principal amount on the account. */
  principal: bigint;

  /** A `PaginatedList` of account `LedgerEntry`s. That is: transfers
   * for which the account is either the sender or the recipient. The
   * paginated list will be sorted in reverse-chronological order
   * (bigger `entryId`s go first). */
  entries: PaginatedList;
}

export type AccountDisplay = {
  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /**
   * The name of the debtor. All accounts belonging to a given
   * creditor must have different `debtorName`s. The creditor may
   * choose any name that is convenient, or easy to remember.
   *
   * Note: For new accounts this field will not be present, and it
   * should be set as soon as possible, otherwise the real identity of
   * the debtor may remain unknown to the creditor, which may lead to
   * confusion and financial loses.
   */
  debtorName?: string;

  /** The type of this object. */
  type?: string;

  /**
   * Optional PIN (Personal Identification Number).
   *
   * Note: This field must be present when the PIN is required for
   * potentially dangerous operations. In such cases, if the passed
   * value is incorrect, the operation will fail. After several such
   * failed attempts, the creditor's PIN will be blocked.
   */
  pin?: string;

  /**
   * The value measurement unit specified by the debtor. It should be
   * shown right after the displayed amount, "500.00 USD" for
   * example. If the account does not have its `unit` field set, the
   * generic currency sign (¤), or the "XXX" ISO 4217 currency code
   * should be shown.
   *
   * Note: For new accounts this field will not be present, and it
   * should be set as soon as possible, otherwise the value
   * measurement unit may remain unknown to the creditor, which may
   * lead to confusion and financial loses.
   */
  unit?: string;

  /** The number of digits to show after the decimal point, when
   * displaying the amount. A negative number signifies the number of
   * insignificant digits at the end of the integer number. For new
   * accounts the value of this field will be `0`. */
  decimalPlaces: bigint;

  /** The URI of the corresponding `Account`. */
  account: ObjectReference;

  /** Whether the account's debtor is known to the creditor. Accepting
   * payments to accounts with an unknown debtor is of course very
   * dangerous, but such accounts can still be useful as links in a
   * chain of currency pegs. For new accounts the value of this field
   * will be `False`. */
  knownDebtor: boolean;

  /**
   * Before displaying the amount, it should be divided by this
   * number. For new accounts the value of this field will be `1`.
   *
   * Note: This value should be used for display purposes
   * only. Notably, the value of this field must be ignored when the
   * exchange rate between pegged accounts is calculated.
   */
  amountDivisor: number;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type Account = {
  /** The URI of creditor's `AccountsList`. */
  accountsList: ObjectReference;

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** Account's `DebtorIdentity`. */
  debtor: DebtorIdentity;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /** The moment at which the account was created. */
  createdAt: string;

  /** Account's `AccountKnowledge` settings. */
  knowledge: AccountKnowledge;

  /** The type of this object. */
  type: string;

  /** Account's `AccountInfo`. */
  info: AccountInfo;

  /** Account's `AccountExchange` settings. */
  exchange: AccountExchange;

  /** Account's `AccountConfig` settings. */
  config: AccountConfig;

  /** Account's `AccountLedger`. */
  ledger: AccountLedger;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;

  /** Account's `AccountDisplay` settings. */
  display: AccountDisplay;
}

export type LedgerEntry = {
  /** Optional URI of the corresponding `CommittedTransfer`. When this
   * field is not present, this means that the ledger entry
   * compensates for one or more negligible transfers. */
  transfer?: ObjectReference;

  /** The new principal amount on the account, as it is after the
   * transfer. Unless a principal overflow has occurred, the new
   * principal amount will be equal to `aquiredAmount` plus the old
   * principal amount. */
  principal: bigint;

  /** The type of this object. */
  type: string;

  /** The ID of the ledger entry. This will always be a positive
   * number. The first ledger entry has an ID of `1`, and the ID of
   * each subsequent ledger entry will be equal to the ID of the
   * previous ledger entry plus one. */
  entryId: bigint;

  /** The amount added to the account's principal. Can be a positive
   * number (an increase), a negative number (a decrease), or zero. */
  aquiredAmount: bigint;

  /** The moment at which the entry was added to the ledger. */
  addedAt: string;

  /** The URI of the corresponding `AccountLedger`. */
  ledger: ObjectReference;
}

export type LedgerEntriesPage = {
  /** An array of `LedgerEntry`s. Can be empty. */
  items: LedgerEntry[];

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The type of this object. */
  type: string;

  /** An URI of another `LedgerEntriesPage` object which contains more
   * items. When there are no remaining items, this field will not be
   * present. If this field is present, there might be remaining
   * items, even when the `items` array is empty. This can be a
   * relative URI. */
  next?: string;
}

export type TransferOptions = {
  /** The transfer will be successful only if it is committed before
   * this moment. This can be useful, for example, when the
   * transferred amount may need to be changed if the transfer can not
   * be committed in time. When this field is not present, this means
   * that the deadline for the transfer will not be earlier than
   * normal. */
  deadline?: string;

  /** The type of this object. */
  type?: string;

  /** The minimal approved interest rate. If the interest rate on the
   * account becomes lower than this value, the transfer will not be
   * successful. This can be useful when the transferred amount may
   * need to be decreased if the interest rate on the account has
   * decreased. */
  minInterestRate?: number;

  /** The amount that should to be locked when the transer is
   * prepared. This must be a non-negative number. */
  lockedAmount?: bigint;
}

export type TransferCreationRequest = {
  /** The format used for the `note` field. An empty string signifies
   * unstructured text. */
  noteFormat?: string;

  /** A client-generated UUID for the transfer. */
  transferUuid: string;

  /** Optional `TransferOptions`. */
  options?: TransferOptions;

  /** The type of this object. */
  type?: string;

  /**
   * Optional PIN (Personal Identification Number).
   *
   * Note: This field must be present when the PIN is required for
   * potentially dangerous operations. In such cases, if the passed
   * value is incorrect, the operation will fail. After several such
   * failed attempts, the creditor's PIN will be blocked.
   */
  pin?: string;

  /** A note from the sender. Can be any string that contains
   * information which the sender wants the recipient to see,
   * including an empty string. */
  note?: string;

  /** The amount that has to be transferred. Must be a non-negative
   * number. Setting this value to zero can be useful when the sender
   * wants to verify whether the recipient's account exists and
   * accepts incoming transfers. */
  amount: bigint;

  /** The recipient's `AccountIdentity` information. */
  recipient: AccountIdentity;
}

export type TransferError = {
  /** The type of this object. */
  type: string;

  /**
   * The error code.
   *
   * `"CANCELED_BY_THE_SENDER"` signifies that the transfer has been
   * canceled by the sender.
   *
   * `"SENDER_DOES_NOT_EXIST"` signifies that the sender's account
   * does not exist.
   *
   * `"RECIPIENT_IS_UNREACHABLE"` signifies that the recipient's
   * account does not exist, or does not accept incoming transfers.
   *
   * `"TRANSFER_NOTE_IS_TOO_LONG"` signifies that the transfer has
   * been rejected because the byte-length of the transfer note is too
   * big.
   *
   * `"INSUFFICIENT_AVAILABLE_AMOUNT"` signifies that the transfer has
   * been rejected due to insufficient amount available on the
   * sender's account.
   *
   * `"TERMINATED"` signifies that the transfer has been terminated
   * due to expired deadline, unapproved interest rate change, or some
   * other *temporary or correctable condition*. If the client
   * verifies the transer options and retries the transfer, chances
   * are that it will be committed successfully.
   */
  errorCode: string;

  /** This field will be present only when the transfer has been
   * rejected due to insufficient available amount. In this case, it
   * will contain the total sum secured (locked) for transfers on the
   * account, *after* this transfer has been finalized. */
  totalLockedAmount?: bigint;
}

export type TransferResult = {
  /** The moment at which the transfer was finalized. */
  finalizedAt: string;

  /** The type of this object. */
  type: string;

  /** An error that has occurred during the execution of the
   * transfer. This field will be present if, and only if, the
   * transfer has been unsuccessful. */
  error?: TransferError;

  /** The transferred amount. If the transfer has been successful, the
   * value will be equal to the requested transfer amount (always a
   * positive number). If the transfer has been unsuccessful, the
   * value will be zero. */
  committedAmount: bigint;
}

export type Transfer = {
  /** The format used for the `note` field. An empty string signifies
   * unstructured text. */
  noteFormat: string;

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** A client-generated UUID for the transfer. */
  transferUuid: string;

  /** The moment of the latest update on this object. The value is the
   * same as the value of the `addedAt` field in the latest `LogEntry`
   * for this object in the log. */
  latestUpdateAt: string;

  /**
   * The moment at which the sender is advised to look at the transfer
   * again, to see if it's status has changed. If this field is not
   * present, this means either that the status of the transfer is not
   * expected to change, or that the moment of the expected change can
   * not be predicted.
   *
   * Note: The value of this field is calculated on-the-fly, so it may
   * change from one request to another, and no `LogEntry` for the
   * change will be added to the log.
   */
  checkupAt?: string;

  /** Contains information about the outcome of the transfer. This
   * field will be preset if, and only if, the transfer has been
   * finalized. Note that a finalized transfer can be either
   * successful, or unsuccessful. */
  result?: TransferResult;

  /** The URI of creditor's `TransfersList`. */
  transfersList: ObjectReference;

  /** Transfer's `TransferOptions`. */
  options: TransferOptions;

  /** The type of this object. */
  type: string;

  /**
   * Optional PIN (Personal Identification Number).
   *
   * Note: This field must be present when the PIN is required for
   * potentially dangerous operations. In such cases, if the passed
   * value is incorrect, the operation will fail. After several such
   * failed attempts, the creditor's PIN will be blocked.
   */
  pin?: string;

  /** A note from the sender. Can be any string that contains
   * information which the sender wants the recipient to see,
   * including an empty string. */
  note: string;

  /** The moment at which the transfer was initiated. */
  initiatedAt: string;

  /** The amount that has to be transferred. Must be a non-negative
   * number. Setting this value to zero can be useful when the sender
   * wants to verify whether the recipient's account exists and
   * accepts incoming transfers. */
  amount: bigint;

  /** The recipient's `AccountIdentity` information. */
  recipient: AccountIdentity;

  /**
   * The sequential number of the latest update in the object. This
   * will always be a positive number, which starts from `1` and gets
   * incremented after each change in the object.
   *
   * When the object is changed by the server, the value of this field
   * will be incremented automatically, and will be equal to the value
   * of the `objectUpdateId` field in the latest `LogEntry` for this
   * object in the log. In this case, the value of the field can be
   * used by the client to decide whether a network request should
   * made to obtain the newest state of the object.
   *
   * When the object is changed by the client, the value of this field
   * must be incremented by the client. In this case, the server will
   * use the value of the field to detect conflicts which can occur
   * when two clients try to update the object simultaneously.
   */
  latestUpdateId: bigint;
}

export type TransferCancelationRequest = {
  /** The type of this object. */
  type?: string;
}

export type CommittedTransfer = {
  /** The format used for the `note` field. An empty string signifies
   * unstructured text. */
  noteFormat: string;

  /** The URI of this object. Can be a relative URI. */
  uri: string;

  /** The amount that this transfer has added to the account's
   * principal. This can be a positive number (an incoming transfer),
   * a negative number (an outgoing transfer), but can not be zero. */
  acquiredAmount: bigint;

  /** This field will be present only for system transfers. Its value
   * indicates the subsystem which originated the transfer. For
   * interest payments the value will be `"interest"`. For transfers
   * that create new money into existence, the value will be
   * `"issuing"`. */
  rationale?: string;

  /** The type of this object. */
  type: string;

  /** A note from the committer of the transfer. Can be any string
   * that contains information which whoever committed the transfer
   * wants the recipient (and the sender) to see. Can be an empty
   * string. */
  note: string;

  /** The URI of the affected `Account`. */
  account: ObjectReference;

  /** The recipient's `AccountIdentity` information. */
  recipient: AccountIdentity;

  /** The moment at which the transfer was committed. */
  committedAt: string;

  /** The sender's `AccountIdentity` information. */
  sender: AccountIdentity;

  latestUpdateAt?: never;
  latestUpdateId?: never;
}
