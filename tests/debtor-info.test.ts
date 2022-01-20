import validate from '../src/debtor-info/validate-schema.js'
import {
  generateCoinInfoDocument,
  parseDebtorInfoDocument,
  InvalidDocument,
  MIME_TYPE_COIN_INFO,
} from '../src/debtor-info'

test("Validate CoinInfo schema", () => {
  expect(validate(1)).toEqual(false)
  expect(validate(null)).toEqual(false)
  expect(validate([])).toEqual(false)
  expect(validate({})).toEqual(false)
  expect(validate({ 'type': 'CoinInfo' })).toEqual(false)
  let data = {
    type: 'CoinInfo-v1',
    revision: 0,
    willNotChangeUntil: '2021-01-01T10:00:00.000Z',
    latestDebtorInfo: { uri: 'http://example.com/' },
    summary: "bla-bla",
    debtorIdentity: { type: 'DebtorIdentity', uri: 'swpt:123' },
    debtorName: 'USA',
    debtorHomepage: { uri: 'https://example.com/USA' },
    amountDivisor: 100.0,
    decimalPlaces: 2,
    unit: 'USD',
    peg: {
      type: 'Peg',
      exchangeRate: 1.0,
      debtorIdentity: { type: 'DebtorIdentity', uri: 'swpt:321' },
      latestDebtorInfo: { uri: 'http://example.com/' },
    },
    unknownProp: 1n,
  }
  expect(validate(data)).toEqual(true)
  expect(validate({ ...data, peg: undefined })).toEqual(true)
  expect(validate({ ...data, type: 'INVALID' })).toEqual(false)
  expect(validate.errors).toEqual([{
    "instancePath": "/type",
    "schemaPath": "#/properties/type/pattern",
    "keyword": "pattern",
    "params": { "pattern": "^CoinInfo(-v[1-9][0-9]{0,5})?$" },
    "message": "must match pattern \"^CoinInfo(-v[1-9][0-9]{0,5})?$\"",
  }])
})

test("Parse CoinInfo document", async () => {
  const text = `{"revision":0,"willNotChangeUntil":"INVALID","latestDebtorInfo":{"uri":"http://example.com/"},"summary":"bla-bla","debtorIdentity":{"type":"DebtorIdentity","uri":"swpt:123"},"debtorName":"USA","debtorHomepage":{"uri":"https://example.com/USA"},"amountDivisor":100,"decimalPlaces":2,"unit":"USD","peg":{"type":"Peg","exchangeRate":1,"debtorIdentity":{"type":"DebtorIdentity","uri":"swpt:321"},"latestDebtorInfo":{"uri":"http://example.com/"}},"type":"CoinInfo"} `
  const document = {
    contentType: MIME_TYPE_COIN_INFO,
    content: (new TextEncoder()).encode(text),
  }
  const parsed = parseDebtorInfoDocument(document)
  expect(parsed.revision).toEqual(0n)
  expect(parsed.willNotChangeUntil).toBeUndefined()

  // wrong MIME type
  expect(() => parseDebtorInfoDocument({ ...document, contentType: 'text/unknown' }))
    .toThrow(InvalidDocument)

  // failed schema validation
  expect(() => parseDebtorInfoDocument({ ...document, content: (new TextEncoder()).encode('{}') }))
    .toThrow(InvalidDocument)

  // too big
  expect(() => parseDebtorInfoDocument({ ...document, content: (new TextEncoder()).encode(text + ' '.repeat(10_000_000)) }))
    .toThrow(InvalidDocument)

  // invalid UTF-8 encoding
  expect(() => parseDebtorInfoDocument({ ...document, content: Int8Array.from([200]) }))
    .toThrow(InvalidDocument)
})

test("Generate and parse CoinInfo document", async () => {
  const debtorData = {
    revision: 0n,
    willNotChangeUntil: '2021-01-01T10:00:00.000Z',
    latestDebtorInfo: { uri: 'http://example.com/' },
    summary: "bla-bla",
    debtorIdentity: { type: 'DebtorIdentity' as const, uri: 'swpt:123' },
    debtorName: 'USA',
    debtorHomepage: { uri: 'https://example.com/USA' },
    amountDivisor: 100.0,
    decimalPlaces: 2n,
    unit: 'USD',
    peg: {
      type: 'Peg' as const,
      exchangeRate: 1.0,
      debtorIdentity: { type: 'DebtorIdentity' as const, uri: 'swpt:321' },
      latestDebtorInfo: { uri: 'http://example.com/' },
    },
    unknownProp: 1,
  }
  await expect(generateCoinInfoDocument({ ...debtorData, revision: -1n }))
    .rejects.toBeInstanceOf(InvalidDocument)
  await expect(generateCoinInfoDocument({ ...debtorData, willNotChangeUntil: 'INVALID' }))
    .rejects.toBeInstanceOf(InvalidDocument)
  const document = await generateCoinInfoDocument(debtorData)
  const { unknownProp, ...noUnknownProps } = debtorData
  expect(parseDebtorInfoDocument(document)).toEqual(noUnknownProps)
})
