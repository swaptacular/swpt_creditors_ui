/* NOTE: The file `./validate-schema.js` is automatically generated
 * from the `./schema.json` file, by running the following command:
 *
 * $ npx ajv compile -s schema.json -o validate-schema.js --strict=true --remove-additional=all --validate-formats=false
 */
import validate from './validate-schema.js'

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
  willNotChangeUntil: string | undefined,
  summary: string | undefined,
  debtorName: string,
  debtorHomepage: ResourceReference | undefined,
  amountDivisor: number,
  decimalPlaces: bigint,
  unit: string,
  peg: Peg | undefined,
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

/*
 Given a proper `DebtorData` object, this function generates a
 document in the default debtor info document format (the default
 format may change from one version to another). An `InvalidDocument`
 error will be thrown when an invalid debtor data object has been
 passed.
*/
export function serializeDebtorData(obj: unknown): Document {
  if (typeof obj !== 'object' || obj === null) {
    throw new InvalidDocument(`the value is not an object`)
  }
  const debtorData = obj as { [prop: string]: unknown }

  // The following ugly logic is only needed to transform `bigint`s
  // into `number`s, before passing the data to `validate()`.
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
  let transformedPeg
  if (debtorData.peg !== undefined) {
    if (typeof debtorData.peg !== 'object' || debtorData.peg === null) {
      throw new InvalidDocument('/peg must be an object')
    }
    const peg = debtorData.peg as { [prop: string]: unknown }
    if (
      typeof peg.exchangeRate !== 'number' &&
      typeof peg.exchangeRate !== 'bigint'
    ) {
      throw new InvalidDocument('/peg/exchangeRate must be a number')
    }
    if (typeof peg.display !== 'object' || peg.display === null) {
      throw new InvalidDocument('/peg/display must be an object')
    }
    const pegDisplay = peg.display as { [prop: string]: unknown }
    if (typeof pegDisplay.decimalPlaces !== 'bigint') {
      throw new InvalidDocument('/peg/display/decimalPlaces must be a bigint')
    }
    if (
      typeof pegDisplay.amountDivisor !== 'number' &&
      typeof pegDisplay.amountDivisor !== 'bigint'
    ) {
      throw new InvalidDocument('/peg/display/amountDivisor must be a number')
    }
    transformedPeg = {
      ...debtorData.peg,
      exchangeRate: Number(peg.exchangeRate),
      display: {
        ...pegDisplay,
        amountDivisor: Number(pegDisplay.amountDivisor),
        decimalPlaces: Number(pegDisplay.decimalPlaces),
      }
    }
  }

  const transformedDebtorData = {
    ...debtorData,
    type: 'CoinInfo',
    revision: Number(debtorData.revision),
    amountDivisor: Number(debtorData.amountDivisor),
    decimalPlaces: Number(debtorData.decimalPlaces),
    peg: transformedPeg,
    willNotChangeUntil: parseOptionalDate(
      debtorData.willNotChangeUntil, '/willNotChangeUntil must be a valid Date')?.toISOString(),
  }
  if (!validate(transformedDebtorData)) {
    const e = validate.errors[0]
    throw new InvalidDocument(`${e.instancePath} ${e.message}`)
  }
  return {
    content: UTF8_ENCODER.encode(JSON.stringify(transformedDebtorData)),
    contentType: MIME_TYPE_COIN_INFO,
  }
}

/*
 This function genarates a document in
 "application/vnd.swaptacular.coin-info+json" format, and calculates
 the SHA256 hash value for it. The format is defined by a JSON Schema
 file (see "./schema.json", "./schema.md"). An `InvalidDocument` error
 will be thrown when invalid data is passed.
*/
export async function generateCoinInfoDocument(debtorData: DebtorData): Promise<DocumentWithHash> {
  const { content, contentType } = serializeDebtorData(debtorData)
  return {
    content,
    contentType,
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
  data.peg = data.peg  // Ensure the `peg` property exists on the object.
  try {
    data.latestDebtorInfo = { uri: new URL(data.latestDebtorInfo.uri).href }
  } catch {
    throw new InvalidDocument('invalid latestDebtorInfo.uri')
  }
  data.summary = data.summary
  data.debtorHomepage = data.debtorHomepage
  data.willNotChangeUntil = parseOptionalDate(data.willNotChangeUntil)?.toISOString()
  data.decimalPlaces = BigInt(Math.ceil(data.decimalPlaces))
  data.revision = BigInt(Math.ceil(data.revision))
  if (data.peg) {
    data.peg.type = 'Peg'
    data.peg.display.type = 'PegDisplay'
    data.peg.display.decimalPlaces = BigInt(Math.ceil(data.peg.display.decimalPlaces))
    try {
      data.peg.latestDebtorInfo = { uri: new URL(data.peg.latestDebtorInfo.uri).href }
    } catch {
      throw new InvalidDocument('invalid peg.latestDebtorInfo.uri')
    }
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

export function sanitizeBaseDebtorData<T extends BaseDebtorData>(data: T): BaseDebtorData {
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

export function matchBaseDebtorData<T1 extends BaseDebtorData, T2 extends BaseDebtorData>(a: T1, b: T2): boolean {
  return (
    a.latestDebtorInfo.uri === b.latestDebtorInfo.uri &&
    a.summary === b.summary &&
    a.debtorName === b.debtorName &&
    a.debtorHomepage?.uri === b.debtorHomepage?.uri &&
    a.amountDivisor === b.amountDivisor &&
    a.decimalPlaces === b.decimalPlaces &&
    a.unit === b.unit &&
    a.willNotChangeUntil === b.willNotChangeUntil &&
    a.peg?.debtorIdentity.uri === a.peg?.debtorIdentity.uri &&
    a.peg?.latestDebtorInfo.uri === a.peg?.latestDebtorInfo.uri &&
    a.peg?.exchangeRate === a.peg?.exchangeRate &&
    a.peg?.display.amountDivisor === a.peg?.display.amountDivisor &&
    a.peg?.display.decimalPlaces === a.peg?.display.decimalPlaces &&
    a.peg?.display.unit === a.peg?.display.unit
  )
}

export async function calcSha256(buffer: ArrayBuffer): Promise<string> {
  return buffer2hex(await crypto.subtle.digest('SHA-256', buffer))
}
