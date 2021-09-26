type ValidationError = {
  instancePath: string,
  schemaPath: string,
  keyword: string,
  params: any,
  message: string,
}

declare const validate: {
  (value: any): boolean,
  errors: ValidationError[],
}
export default validate
