/* NOTE: The file `./validate-schema.js` is automatically generated
 * from the `./schema.json` file, by running the following command:
 *
 * $ npx ajv compile -s schema.json -o validate-schema.js --strict=true --remove-additional=all --validate-formats=false
 */
import validate from './validate-schema.js'
import equal from 'fast-deep-equal'

const UTF8_ENCODER = new TextEncoder()
const UTF8_DECODER = new TextDecoder()
const MAX_DOCUMENT_CONTENT_SIZE = 5 * 1024 * 1024

function buffer2hex(buffer: ArrayBuffer, options = { toUpperCase: true }) {
  const bytes = [...new Uint8Array(buffer)]
  const hex = bytes.map(n => n.toString(16).padStart(2, '0')).join('')
  return options.toUpperCase ? hex.toUpperCase() : hex
}

function parseOptionalDate(value: unknown, errorMsg?: string): Date | undefined {
  let date
  if (value !== undefined) {
    date = typeof value === 'string' ? new Date(value) : new Date(NaN)
    if (
      Number.isNaN(date.getTime()) ||
      date.getFullYear() > 9998 ||
      date.getFullYear() < 1970
    ) {
      if (errorMsg !== undefined) {
        throw new InvalidDocument(errorMsg)
      }
      return undefined
    }
  }
  return date
}

function serializeDebtorData(debtorData: any): Uint8Array {
  if (debtorData === null || typeof debtorData !== 'object') {
    throw new InvalidDocument(`the value is not an object`)
  }

  // Ensure `willNotChangeUntil` is a valid ISO datetime.
  const willNotChangeUntil = parseOptionalDate(
    debtorData.willNotChangeUntil, '/willNotChangeUntil must be a valid Date')?.toISOString()

  // The following ugly logic is needed only to change `bigint`s into
  // `number`s, before passing the data to `validate()`.
  if (typeof debtorData.revision !== 'bigint') {
    throw new InvalidDocument('/revision must must be a bigint')
  }
  if (typeof debtorData.decimalPlaces !== 'bigint') {
    throw new InvalidDocument('/decimalPlaces must be a bigint')
  }
  if (
    typeof debtorData.amountDivisor !== 'number' &&
    typeof debtorData.amountDivisor !== 'bigint'
  ) {
    throw new InvalidDocument('/amountDivisor must be a number')
  }
  let peg
  if (debtorData.peg !== undefined) {
    if (debtorData.peg === null || typeof debtorData.peg !== 'object') {
      throw new InvalidDocument('/peg must be an object')
    }
    if (
      typeof debtorData.peg.exchangeRate !== 'number' &&
      typeof debtorData.peg.exchangeRate !== 'bigint'
    ) {
      throw new InvalidDocument('/peg/exchangeRate must be a number')
    }
    if (debtorData.peg.display === null || typeof debtorData.peg.display !== 'object') {
      throw new InvalidDocument('/peg/display must be an object')
    }
    if (typeof debtorData.peg.display.decimalPlaces !== 'bigint') {
      throw new InvalidDocument('/peg/display/decimalPlaces must be a bigint')
    }
    if (
      typeof debtorData.peg.display.amountDivisor !== 'number' &&
      typeof debtorData.peg.display.amountDivisor !== 'bigint'
    ) {
      throw new InvalidDocument('/peg/display/amountDivisor must be a number')
    }
    peg = {
      ...debtorData.peg,
      exchangeRate: Number(debtorData.peg.exchangeRate),
      display: {
        ...debtorData.peg.display,
        amountDivisor: Number(debtorData.peg.display.amountDivisor),
        decimalPlaces: Number(debtorData.peg.display.decimalPlaces),
      }
    }
  }
  const data = {
    ...debtorData,
    type: 'CoinInfo',
    revision: Number(debtorData.revision),
    amountDivisor: Number(debtorData.amountDivisor),
    decimalPlaces: Number(debtorData.decimalPlaces),
    willNotChangeUntil,
    peg,
  }

  if (!validate(data)) {
    const e = validate.errors[0]
    throw new InvalidDocument(`${e.instancePath} ${e.message}`)
  }
  return UTF8_ENCODER.encode(JSON.stringify(data))
}

export type ResourceReference = {
  uri: string,
}

export type DebtorIdentity = {
  type: 'DebtorIdentity',
  uri: string,
}

export type Peg = {
  type: 'Peg',
  exchangeRate: number,
  debtorIdentity: DebtorIdentity,
  latestDebtorInfo: ResourceReference,
  display: PegDisplay,
}

export type PegDisplay = {
  type: 'PegDisplay',
  amountDivisor: number,
  decimalPlaces: bigint,
  unit: string,
}

export type BaseDebtorData = {
  latestDebtorInfo: ResourceReference,
  willNotChangeUntil?: string,
  summary?: string,
  debtorName: string,
  debtorHomepage?: ResourceReference,
  amountDivisor: number,
  decimalPlaces: bigint,
  unit: string,
  peg?: Peg,
}

export type DebtorData = BaseDebtorData & {
  debtorIdentity: DebtorIdentity,
  revision: bigint,
}

export type Document = {
  contentType: string,
  content: ArrayBuffer,
}

export type DocumentWithHash = Document & {
  sha256: string,
}

export class InvalidDocument extends Error {
  name = 'InvalidDocument'
}

export const MIME_TYPE_COIN_INFO = 'application/vnd.swaptacular.coin-info+json'

export function validateBaseDebtorData(baseDebtorData: unknown): DebtorData | undefined {
  let debtorData
  if (typeof baseDebtorData === 'object') {
    let content
    try {
      content = serializeDebtorData({
        ...baseDebtorData,
        debtorIdentity: { type: 'DebtorIdentity' as const, uri: '' },
        revision: 0n,
      })
    } catch (e: unknown) {
      if (e instanceof InvalidDocument) { console.warn(e) }
      else throw e
    }
    if (content) {
      debtorData = parseDebtorInfoDocument({ content, contentType: MIME_TYPE_COIN_INFO })
    }
  }
  return debtorData
}

/*
 This function genarates a document in
 "application/vnd.swaptacular.coin-info+json" format. This format is
 defined by a JSON Schema file (see "./schema.json",
 "./schema.md"). An `InvalidDocument` error will be thrown when
 invalid data is passed.
*/
export async function generateCoinInfoDocument(debtorData: DebtorData): Promise<DocumentWithHash> {
  const content = serializeDebtorData(debtorData)
  return {
    content,
    contentType: MIME_TYPE_COIN_INFO,
    sha256: await calcSha256(content),
  }
}

/*
 Currently, this function can parse only files with content type
 "application/vnd.swaptacular.coin-info+json". An `InvalidDocument`
 error will be thrown if the document can not be parsed.
*/
export function parseDebtorInfoDocument(document: Document): DebtorData {
  if (document.contentType !== MIME_TYPE_COIN_INFO) {
    throw new InvalidDocument('unknown content type')
  }
  if (document.content.byteLength > MAX_DOCUMENT_CONTENT_SIZE) {
    throw new InvalidDocument('document is too big')
  }
  let text, data
  try {
    text = UTF8_DECODER.decode(document.content)
  } catch {
    throw new InvalidDocument('decoding error')
  }
  try {
    data = JSON.parse(text)
  } catch {
    throw new InvalidDocument('parse error')
  }
  if (!validate(data)) {
    const e = validate.errors[0]
    throw new InvalidDocument(`${e.instancePath} ${e.message}`)
  }
  data.willNotChangeUntil = parseOptionalDate(data.willNotChangeUntil)?.toISOString()
  data.decimalPlaces = BigInt(Math.ceil(data.decimalPlaces))
  data.revision = BigInt(Math.ceil(data.revision))
  if (data.peg) {
    data.peg.type = 'Peg'
    data.peg.display.type = 'PegDisplay'
    data.peg.display.decimalPlaces = BigInt(Math.ceil(data.peg.display.decimalPlaces))
  }
  delete data.type
  return data
}

export function tryToParseDebtorInfoDocument(document: Document): DebtorData | undefined {
  let debtorData
  try {
    debtorData = parseDebtorInfoDocument(document)
  } catch (e: unknown) {
    if (e instanceof InvalidDocument) { console.warn(e) }
    else throw e
  }
  return debtorData
}

export function sanitizeBaseDebtorData(data: BaseDebtorData): BaseDebtorData {
  const {
    latestDebtorInfo, summary, debtorName, debtorHomepage,
    amountDivisor, decimalPlaces, unit, willNotChangeUntil,
    peg,
  } = data

  let sanitizedPeg
  if (peg) {
    const { exchangeRate, debtorIdentity, latestDebtorInfo, display } = peg
    const { amountDivisor, decimalPlaces, unit } = display
    sanitizedPeg = {
      type: peg.type,
      exchangeRate,
      debtorIdentity,
      latestDebtorInfo,
      display: { type: display.type, amountDivisor, decimalPlaces, unit },
    }
  }
  return {
    latestDebtorInfo, summary, debtorName, debtorHomepage,
    amountDivisor, decimalPlaces, unit, willNotChangeUntil,
    peg: sanitizedPeg,
  }
}

export async function calcSha256(buffer: ArrayBuffer): Promise<string> {
  return buffer2hex(await crypto.subtle.digest('SHA-256', buffer))
}

export function matchBaseDebtorData(a: BaseDebtorData, b: BaseDebtorData): boolean {
  return (
    a.latestDebtorInfo.uri === b.latestDebtorInfo.uri &&
    a.summary === b.summary &&
    a.debtorName === b.debtorName &&
    a.debtorHomepage?.uri === b.debtorHomepage?.uri &&
    a.amountDivisor === b.amountDivisor &&
    a.decimalPlaces === b.decimalPlaces &&
    a.unit === b.unit &&
    equal(a.peg, b.peg) &&
    a.willNotChangeUntil === b.willNotChangeUntil
  )
}
