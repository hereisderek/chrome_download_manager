/**
 * POSIX single-quote a value for safe interpolation into a generated shell command.
 *
 * The values we quote (URLs, filenames, cookie headers) come from download
 * metadata that a remote site controls, so naive `"${value}"` interpolation
 * is a command-injection vector once the generated script is executed
 * (e.g. a filename of `"; rm -rf ~; "`). Single-quoting disables all shell
 * expansion inside the value; embedded single quotes are escaped by closing
 * the quote, emitting an escaped quote, and reopening it.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
