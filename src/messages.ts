// Messages for payment error codes:
export const CANCELED_BY_THE_SENDER = "The payment has been canceled by the sender."
export const SENDER_IS_UNREACHABLE = "The sender's account does not exist or can not make outgoing transfers."
export const RECIPIENT_IS_UNREACHABLE = "The recipient's account does not exist or does not accept incoming payments."
export const RECIPIENT_SAME_AS_SENDER = "The recipient's account is the same as the sender's account."
export const NO_RECIPIENT_CONFIRMATION = "A confirmation from the recipient is required, but has not been obtained."
export const TRANSFER_NOTE_IS_TOO_LONG = "The byte-length of the payment note is too big."
export const INSUFFICIENT_AVAILABLE_AMOUNT = "The requested amount is not available on the sender's account."
export const TIMEOUT = "The payment has been terminated due to expired deadline."
export const NEWER_INTEREST_RATE = (
  "The payment has been terminated because the current interest rate on the" +
  " account is more recent than the specified final interest rate timestamp."
)

// Operational alerts:
export const OPERATION_REQUIRES_AUTHENTICATION = "This operation requires authentication. You will be redirected to the login page."
export const PROBLEM_ON_THE_SERVER = "There seems to be a problem on the server. Please try again later."
export const NETWORK_PROBLEM = "A network problem has occurred. Please check your Internet connection."
export const SERVER_SYNC_ERROR = "A server error has occurred."
export const UNEXPECTED_ERROR = "Oops, something went wrong."
export const INVALID_SCANNED_COIN = (
  "Invalid digital coin. "
  + "Make sure that you are scanning the correct QR code, "
  + "for the correct digital coin."
)
export const INVALID_PAYMENT_REQUEST = (
  "Invalid payment request. Make sure that you are scanning the correct" +
  " QR code, for the correct payment request."
)
export const WRONG_PIN = (
  "A wrong PIN has been entered. "
  + "Be aware that you have a limited number of attempts to enter "
  + "the correct PIN, before it gets blocked."
)
export const COIN_FETCH_ERROR = (
  "Can not read the necessary "
  + "currency information from the digital coin. This is either a "
  + "temporary problem, or the digital coin is not correctly set up."
)
export const CIRCULAR_PEG = (
  "Approving this peg is not possible, because "
  + "it would create a circular chain of pegs."
)
export const PEG_DISPLAY_MISMATCH = (
  "The information specified by the issuer "
  + "of the pegged currency do not match the available information about "
  + "the anchor currency. First, make sure that you have acknowledged the latest "
  + "changes in the anchor currency. Then, you may try to approve the peg "
  + "again, or decide to not approve it."
)
export const BUYING_IS_FORBIDDEN = (
  "Automatic buying is not allowed "
  + "for this account. This may be just a temporary condition, if the "
  + "account has been created only recently, or you have not acknowledged "
  + "the latest changes in the account."
)
export const ACCOUNT_DOES_NOT_EXIST = (
  "You do not have an account in the requested currency."
)
export const ACCOUNT_CAN_NOT_MAKE_PAYMENTS = (
  "You do have an account "
  + "in the requested currency, but making payments from this account is not "
  + "allowed. This may be just a temporary condition, if the account has "
  + "been created only recently."
)

// This message will be shown when the user wants to view the details of a
// payment (a transfer) that the user has made, but for some reason
// the payment do not exist.
export const PAYMENT_DOES_NOT_EXIST = "The requested payment record does not exist."

// Problems with handling "Actions":
export const CAN_NOT_PERFORM_ACTOIN = "The requested action can not be performed."
export const ACTION_DOES_NOT_EXIST = "The requested action record does not exist."

// A dictionary in which to look for translations for currency names.
// It might be a good idea to translate the well-known names for the
// well-known currencies, like "United States Dollar" and "Euro". This
// dictionary-like object allows you to do this. You can add as many
// entries as you like, within reason. The format is: "original name":
// "translated name".
export const DEBTOR_NAME_TRANSLATIONS: { [key: string]: string } = {
  "United States Dollar": "United States Dollar",
  "Euro": "Euro",
}

// LEAVE THIS AS IS! It is the official summary for USD.
const usdSummary = (
  "The United States dollar (symbol: $; currency code: USD; also abbreviated"
    + " US$ to distinguish it from other dollar-denominated currencies; referred"
    + " to as the dollar, U.S. dollar, American dollar, or colloquially buck) is"
    + " the official currency of the United States and several other countries."
)

// LEAVE THIS AS IS! It is the official summary for EUR.
const eurSummary = (
  "The euro (symbol: €; currency code: EUR) is the official currency of many"
    + " of the member states of the European Union. This group of states is"
    + " officially known as the euro area, more commonly named the eurozone."
    + " The currency is also used officially by the institutions of the European Union."
)

// A dictionary in which to look for translations for currency
// summaries. It might be a good idea to translate the well-known
// descriptions for the well-known currencies, like USD and EUR. This
// dictionary-like object allows you to do this. You can add as many
// entries as you like, within reason.
export const SUMMARY_TRANSLATIONS: { [key: string]: string } = {
  [usdSummary]: (
    // The translated summary for USD:
    usdSummary
  ),
  [eurSummary]: (
    // The translated summary for EUR:
    eurSummary
  ),
}

// Generates a message to be shown in a tooltip. Change this function
// to return a translated string. Also, make sure to pass your locale
// as a parameter in the calls to `toLocaleString()` that this
// function makes (`.toLocaleString('bg-BG')` for example).
export function getTransferStatusDetails(t: any): string {
  const initiatedAt = new Date(t.initiatedAt).toLocaleString()
  if (t.result) {
    const finalizedAt = new Date(t.result.finalizedAt).toLocaleString()
    if (t.result.error) {
      const reason = getFailureReason(t.result.error.errorCode)
      return `The payment has been initiated at ${initiatedAt},`
        + ` and failed at ${finalizedAt}.`
        + ` The reason for the failure is: "${reason}".`
    } else {
      const paymentRefernece = t.paymentInfo.payeeReference
      if (paymentRefernece) {
        const maxLength = 64
        const shortRef = paymentRefernece.length <= maxLength
          ? paymentRefernece
          : `${paymentRefernece.slice(0, maxLength)}...`
        return `The payment has been initiated at ${initiatedAt},`
          + ` and succeeded at ${finalizedAt}.`
          + ` The payment reference is: "${shortRef}".`
      } else {
        return `The payment has been initiated at ${initiatedAt},`
          + ` and succeeded at ${finalizedAt}.`
      }
    }
  }
  return `The payment has been initiated at ${initiatedAt}.`
}

function getFailureReason(errorCode: string): string {
  switch (errorCode) {
    case 'CANCELED_BY_THE_SENDER':
      return CANCELED_BY_THE_SENDER
    case 'SENDER_IS_UNREACHABLE':
      return SENDER_IS_UNREACHABLE
    case 'RECIPIENT_IS_UNREACHABLE':
      return RECIPIENT_IS_UNREACHABLE
    case 'RECIPIENT_SAME_AS_SENDER':
      return RECIPIENT_SAME_AS_SENDER
    case 'NO_RECIPIENT_CONFIRMATION':
      return NO_RECIPIENT_CONFIRMATION
    case 'TRANSFER_NOTE_IS_TOO_LONG':
      return TRANSFER_NOTE_IS_TOO_LONG
    case 'INSUFFICIENT_AVAILABLE_AMOUNT':
      return INSUFFICIENT_AVAILABLE_AMOUNT
    case 'TIMEOUT':
      return TIMEOUT
    case 'NEWER_INTEREST_RATE':
      return NEWER_INTEREST_RATE
    default:
      return errorCode
  }
}
