/* This module implements a custom JSON parser, and a custom JSON
 * serializer. This is necessary because Javascript's builtin parser
 * treats 64-bit integers as floats, losing precision. The implemented
 * custom parser treats all numbers containing "E", "e", or "." as
 * floats, and all other numbers as bigints. The custom serializer
 * outputs both floats and bigints as numbers, but ensures that floats
 * are presented in an exponential form, which always contains "e".
 */
import { create_parser } from './parse.js'
export { stringify } from './stringify.js'
const parse = create_parser()
export { parse, create_parser }
