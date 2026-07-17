// smejj.com — WebAuthn-Encoding-Helfer (Single Responsibility: base64url + minimaler CBOR-Decoder).
// Reines Node, keine Dependency (Control-Server-Policy). Der CBOR-Decoder deckt
// nur die Teilmenge ab, die WebAuthn nutzt: unsigned/negative Ints, Byte-/Text-
// Strings, Arrays, Maps und einfache Werte (false/true/null). Kein Float noetig.

export function base64UrlToBuffer(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function bufferToBase64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

// Decodiert genau EIN CBOR-Element ab offset. Gibt { value, offset } zurueck.
export function decodeCborFirst(buffer, offset = 0) {
  return readItem(buffer, offset);
}

export function decodeCbor(buffer) {
  return readItem(buffer, 0).value;
}

function readItem(buf, offset) {
  if (offset >= buf.length) throw new Error("CBOR: unerwartetes Ende");
  const initial = buf[offset];
  const major = initial >> 5;
  const minor = initial & 0x1f;
  let pos = offset + 1;

  const readLength = () => {
    if (minor < 24) return minor;
    if (minor === 24) { const v = buf[pos]; pos += 1; return v; }
    if (minor === 25) { const v = buf.readUInt16BE(pos); pos += 2; return v; }
    if (minor === 26) { const v = buf.readUInt32BE(pos); pos += 4; return v; }
    if (minor === 27) { const v = Number(buf.readBigUInt64BE(pos)); pos += 8; return v; }
    throw new Error(`CBOR: nicht unterstuetzte Laenge ${minor}`);
  };

  switch (major) {
    case 0: { // unsigned int
      const value = readLength();
      return { value, offset: pos };
    }
    case 1: { // negative int
      const value = -1 - readLength();
      return { value, offset: pos };
    }
    case 2: { // byte string
      const len = readLength();
      const value = buf.subarray(pos, pos + len);
      return { value, offset: pos + len };
    }
    case 3: { // text string
      const len = readLength();
      const value = buf.toString("utf8", pos, pos + len);
      return { value, offset: pos + len };
    }
    case 4: { // array
      const len = readLength();
      const arr = [];
      let cur = pos;
      for (let i = 0; i < len; i += 1) {
        const item = readItem(buf, cur);
        arr.push(item.value);
        cur = item.offset;
      }
      return { value: arr, offset: cur };
    }
    case 5: { // map
      const len = readLength();
      const map = new Map();
      let cur = pos;
      for (let i = 0; i < len; i += 1) {
        const key = readItem(buf, cur);
        const val = readItem(buf, key.offset);
        map.set(key.value, val.value);
        cur = val.offset;
      }
      return { value: map, offset: cur };
    }
    case 7: { // simple values
      if (minor === 20) return { value: false, offset: pos };
      if (minor === 21) return { value: true, offset: pos };
      if (minor === 22) return { value: null, offset: pos };
      if (minor === 23) return { value: undefined, offset: pos };
      throw new Error(`CBOR: nicht unterstuetzter simple value ${minor}`);
    }
    default:
      throw new Error(`CBOR: nicht unterstuetzter major type ${major}`);
  }
}
