import equal from 'fast-deep-equal'
import {
  parsePaymentRequest,
  parseTransferNote,
  generatePr0Blob,
  generatePayment0TransferNote,
  IvalidPaymentData,
  MIME_TYPE_PR0,
} from '../src/payment-requests'

test("Parse payement request", async () => {
  const blob = new Blob([
    'PR0\n',
    '\n',
    'swpt:112233445566778899/998877665544332211\n',
    'Payee Name\n',
    '1000\n',
    '2001-01-01\n',
    '12d3a45642665544\n',
    '.\n',
    'http://example.com'
  ])
  const request = await parsePaymentRequest(blob)
  expect(Object.getOwnPropertyNames(request).sort()).toEqual([
    "accountUri",
    "amount",
    "deadline",
    "description",
    "payeeName",
    "payeeReference",
  ])
  expect(request.amount).toEqual(1000n)
  expect(request.accountUri).toEqual('swpt:112233445566778899/998877665544332211')
  expect(request.payeeName).toEqual('Payee Name')
  expect(request.deadline).toEqual(new Date('2001-01-01'))
  expect(request.payeeReference).toEqual('12d3a45642665544')
  expect(request.description).toEqual({
    contentFormat: '.',
    content: 'http://example.com',
  })
})

test("Generate and parse payment request", async () => {
  const request: any = {
    accountUri: 'swpt:124/456',
    payeeName: 'Payee name',
    amount: 1000n,
    deadline: new Date('2021-07-20T09:19:07.643Z'),
    payeeReference: 'payeeReference',
    description: {
      contentFormat: '',
      content: 'This is a multi-line\ndescription.',
    },
  }
  for (const includeCrc of [true, false]) {
    const blob = generatePr0Blob(request, { includeCrc })
    expect(blob.type).toEqual(MIME_TYPE_PR0)
    expect(await blob.text()).toEqual(
      "PR0\n" +
      (includeCrc ? "61ea4c13\n" : "\n") +
      "swpt:124/456\n" +
      "Payee name\n" +
      "1000\n" +
      "2021-07-20T09:19:07.643Z\n" +
      "payeeReference\n" +
      "\n" +
      "This is a multi-line\n" +
      "description."
    )
    const parsed: any = await parsePaymentRequest(blob)
    expect(Object.getOwnPropertyNames(request).sort())
      .toEqual(Object.getOwnPropertyNames(parsed).sort())
    expect(Object.getOwnPropertyNames(request).every(k => equal(request[k], parsed[k])))
      .toBeTruthy()
  }
})

test("Parse transfer note", async () => {
  const noteFormat = 'PAYMENT0'
  const note = [
    '12d3a45642665544\n',
    'Payee Name\n',
    'alabala\n',
    'This is a multi-line\ndescription.',
  ].join('')
  expect(parseTransferNote({ note, noteFormat })).toEqual({
    payeeName: 'Payee Name',
    payeeReference: '12d3a45642665544',
    description: {
      contentFormat: 'alabala',
      content: 'This is a multi-line\ndescription.',
    }
  })
  expect(parseTransferNote({ note: 'Hi!\nHere is a payment.', noteFormat: 'unknown' })).toEqual({
    payeeName: '',
    payeeReference: 'Hi!',
    description: {
      contentFormat: 'unknown',
      content: 'Hi!\nHere is a payment.',
    }
  })
  expect(parseTransferNote({ note: 'Hi!', noteFormat: '' })).toEqual({
    'description': {
      'content': 'Hi!',
      'contentFormat': '',
    },
    'payeeName': '',
    'payeeReference': '',
  })
  expect(parseTransferNote({ note: 'A payment for `Santa\nClaus`.', noteFormat: '' })).toEqual({
    'description': {
      'content': 'A payment for `Santa\nClaus`.',
      'contentFormat': '',
    },
    'payeeName': 'Santa Claus',
    'payeeReference': '',
  })
})

test("Generate and parse payment0 transfer note", async () => {
  const description = {
    contentFormat: '',
    content: 'This is a multi-line\ndescription.',
  }
  const request = {
    accountUri: 'swpt:124/456',
    payeeName: 'Payee name',
    amount: 1000n,
    deadline: new Date(),
    payeeReference: 'payeeReference',
    description,
  }
  const noteFormat = 'payment0'
  const note = generatePayment0TransferNote(request)
  const parsed = parseTransferNote({ noteFormat, note })
  expect(parsed.payeeReference).toEqual('payeeReference')
  expect(parsed.payeeName).toEqual('Payee name')
  expect(parsed.description).toEqual(description)
  expect(parsed.description).toEqual(description)
  expect(parsed.description).toEqual(request.description)
  expect(() => generatePayment0TransferNote(request, 10)).toThrowError(IvalidPaymentData)
})
