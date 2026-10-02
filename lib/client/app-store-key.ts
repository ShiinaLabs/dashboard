export function keyIdFromFilename(filename: string): string | undefined {
  return /^AuthKey_([A-Z0-9]{10})\.p8$/.exec(filename)?.[1];
}
