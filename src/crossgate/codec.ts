/**
 * CrossGate RLE codec for decoding graphic data.
 *
 * The encoded stream uses a flag-byte scheme:
 * - High nibble determines operation type and count size
 * - Low nibble is part of the byte count
 *
 * Operations:
 * - 0x0_/0x1_/0x2_: Copy literal bytes from stream
 * - 0x8_/0x9_/0xA_: Repeat a single data byte
 * - 0xC_/0xD_/0xE_: Repeat zero (transparent)
 */
export function rleDecode(encoded: Uint8Array): Uint8Array {
  const result: number[] = [];
  let pos = 0;

  while (pos < encoded.length) {
    const flag = encoded[pos++];
    const highNibble = flag & 0xf0;

    // Determine data byte
    let dataByte: number | null = null;
    if (highNibble === 0x80 || highNibble === 0x90 || highNibble === 0xa0) {
      dataByte = encoded[pos++];
    } else if (
      highNibble === 0xc0 ||
      highNibble === 0xd0 ||
      highNibble === 0xe0
    ) {
      dataByte = 0x00;
    }

    // Determine count
    let count: number;
    if (highNibble === 0x00 || highNibble === 0x80 || highNibble === 0xc0) {
      count = flag & 0x0f;
    } else if (
      highNibble === 0x10 ||
      highNibble === 0x90 ||
      highNibble === 0xd0
    ) {
      count = ((flag & 0x0f) << 8) + encoded[pos++];
    } else if (
      highNibble === 0x20 ||
      highNibble === 0xa0 ||
      highNibble === 0xe0
    ) {
      const b1 = encoded[pos++];
      const b2 = encoded[pos++];
      count = ((flag & 0x0f) << 16) + (b1 << 8) + b2;
    } else {
      throw new Error(`Invalid RLE flag: 0x${flag.toString(16)}`);
    }

    // Produce output
    if (dataByte === null) {
      // Literal copy
      for (let i = 0; i < count; i++) {
        result.push(encoded[pos++]);
      }
    } else {
      // Fill
      for (let i = 0; i < count; i++) {
        result.push(dataByte);
      }
    }
  }

  return new Uint8Array(result);
}
