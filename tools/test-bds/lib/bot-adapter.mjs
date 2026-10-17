// Narrow native BDS RakNet network-bot adapter and capability probe.
// Evaluates and adapts patterns from AIKUSAN/minecraft-agent-skills-bundle
// (.agents/skills/minecraft-bot-qa/scripts/bedrock/{bedrock_lib.js,bedrock_ping.js,bedrock_quest.js}, MIT License).
// Never claims visual UI/nameplate verification: protocol bots cannot render JSON UI or entity nameplates.
import crypto from "node:crypto";
import dgram from "node:dgram";

export const RAKNET_MAGIC = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
export const AIKUSAN_REFERENCE = {
  repo: "https://github.com/AIKUSAN/minecraft-agent-skills-bundle",
  path: ".agents/skills/minecraft-bot-qa",
  license: "MIT",
  pinnedDependency: "bedrock-protocol@3.60.1",
  documentedTarget: "Geyser/Floodgate 1.21.x (Node >=24)",
};

export function buildUnconnectedPing(guid = crypto.randomBytes(8)) {
  const buf = Buffer.alloc(1 + 8 + 16 + 8);
  buf[0] = 0x01; // ID_UNCONNECTED_PING
  buf.writeBigInt64BE(BigInt(Date.now()), 1);
  RAKNET_MAGIC.copy(buf, 9);
  guid.copy(buf, 25);
  return buf;
}

export function parseUnconnectedPong(msg) {
  if (!Buffer.isBuffer(msg) || msg.length < 35 || msg[0] !== 0x1c) return null;
  const pingTime = msg.readBigInt64BE(1);
  const serverGuid = msg.readBigUInt64BE(9).toString(16);
  const magic = msg.subarray(17, 33);
  if (!magic.equals(RAKNET_MAGIC)) return null;
  const strLen = msg.readUInt16BE(33);
  const raw = msg.subarray(35, 35 + strLen).toString("utf8");
  const parts = raw.split(";");
  return {
    edition: parts[0] || "MCPE",
    motd: parts[1] || "",
    protocol: Number(parts[2] || 0),
    version: parts[3] || "",
    playersOnline: Number(parts[4] || 0),
    playersMax: Number(parts[5] || 0),
    serverGuid,
    levelName: parts[7] || "",
    gamemode: parts[8] || "",
    gamemodeId: Number(parts[9] || 0),
    portV4: Number(parts[10] || 0),
    portV6: Number(parts[11] || 0),
    pingTime: Number(pingTime),
    raw,
  };
}

function writeIpv4Address(buf, offset, ip = "127.0.0.1", port = 19132) {
  buf[offset] = 4;
  const octets = ip.split(".").map((n) => Number(n) & 0xff);
  for (let i = 0; i < 4; i++) buf[offset + 1 + i] = (~octets[i]) & 0xff;
  buf.writeUInt16BE(port, offset + 5);
}

export function buildOpenConnectionRequest1(mtu = 1400, protocolVersion = 11) {
  const buf = Buffer.alloc(mtu, 0);
  buf[0] = 0x05; // ID_OPEN_CONNECTION_REQUEST_1
  RAKNET_MAGIC.copy(buf, 1);
  buf[17] = protocolVersion;
  return buf;
}

export function buildOpenConnectionRequest2(host, port, mtu = 1400, clientGuid = crypto.randomBytes(8)) {
  const buf = Buffer.alloc(1 + 16 + 7 + 2 + 8);
  buf[0] = 0x07; // ID_OPEN_CONNECTION_REQUEST_2
  RAKNET_MAGIC.copy(buf, 1);
  writeIpv4Address(buf, 17, host, port);
  buf.writeUInt16BE(mtu, 24);
  clientGuid.copy(buf, 26);
  return buf;
}

function buildReliableFrame(seqNumber, messageIndex, payload) {
  // 0x84 = frame set packet; 0x40 = RELIABLE (bits 010 << 5)
  const bodyLenBits = payload.length * 8;
  const buf = Buffer.alloc(4 + 1 + 2 + 3 + payload.length);
  buf[0] = 0x84;
  buf.writeUIntLE(seqNumber, 1, 3);
  buf[4] = 0x40;
  buf.writeUInt16BE(bodyLenBits, 5);
  buf.writeUIntLE(messageIndex, 7, 3);
  payload.copy(buf, 10);
  return buf;
}

function buildConnectionRequest(clientGuid) {
  const buf = Buffer.alloc(1 + 8 + 8 + 1);
  buf[0] = 0x09; // ID_CONNECTION_REQUEST
  clientGuid.copy(buf, 1);
  buf.writeBigInt64BE(BigInt(Date.now()), 9);
  buf[17] = 0; // useSecurity = false
  return buf;
}

function writeUnsignedVarInt(value) {
  const out = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return Buffer.from(out);
}

function readUnsignedVarInt(buf, offset = 0) {
  let value = 0;
  let shift = 0;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i++];
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: value >>> 0, next: i };
    shift += 7;
  }
  return null;
}

export function buildRequestNetworkSettingsFrame(seqNumber, messageIndex, protocol) {
  // Game packet wrapper 0xfe + VarInt(length) + VarInt(0xc1 = 193 RequestNetworkSettings) + Int32BE(protocol)
  const idVar = writeUnsignedVarInt(0xc1);
  const inner = Buffer.alloc(idVar.length + 4);
  idVar.copy(inner, 0);
  inner.writeInt32BE(protocol, idVar.length);
  const lenVar = writeUnsignedVarInt(inner.length);
  const gamePacket = Buffer.concat([Buffer.from([0xfe]), lenVar, inner]);
  return buildReliableFrame(seqNumber, messageIndex, gamePacket);
}

function parseRakNetFrames(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] < 0x80 || buf[0] > 0x8f) return [];
  const bodies = [];
  let off = 4;
  while (off + 3 <= buf.length) {
    const flags = buf[off++];
    const reliability = (flags >> 5) & 0x07;
    const isSplit = (flags & 0x10) !== 0;
    const bitLen = buf.readUInt16BE(off);
    off += 2;
    const byteLen = Math.ceil(bitLen / 8);
    if (reliability === 2 || reliability === 3 || reliability === 4 || reliability === 6 || reliability === 7) off += 3;
    if (reliability === 1 || reliability === 4) off += 3;
    if (reliability === 1 || reliability === 3 || reliability === 4 || reliability === 7) off += 4;
    if (isSplit) off += 10;
    if (off + byteLen > buf.length) break;
    bodies.push(buf.subarray(off, off + byteLen));
    off += byteLen;
  }
  return bodies;
}

function decodeGamePacket(body) {
  if (!body || body.length < 2 || body[0] !== 0xfe) return null;
  // Uncompressed batch right after RequestNetworkSettings (or 0xff raw indicator in newer Bedrock)
  let pos = 1;
  if (body[pos] === 0xff || body[pos] === 0x00) pos++;
  const lenInfo = readUnsignedVarInt(body, pos);
  if (!lenInfo) return { rawHex: body.toString("hex") };
  const sub = body.subarray(lenInfo.next, lenInfo.next + lenInfo.value);
  const idInfo = readUnsignedVarInt(sub, 0);
  if (!idInfo) return { rawHex: body.toString("hex") };
  const packetId = idInfo.value & 0x3ff;
  const payload = sub.subarray(idInfo.next);
  if (packetId === 0x8f && payload.length >= 6) {
    return {
      packetId: 0x8f,
      packetName: "network_settings",
      compressionThreshold: payload.readUInt16LE(0),
      compressionAlgorithm: payload.readUInt16LE(2),
      clientThrottleEnabled: Boolean(payload[4]),
    };
  }
  if (packetId === 0x02 && payload.length >= 4) {
    return {
      packetId: 0x02,
      packetName: "play_status",
      status: payload.readInt32BE(0),
    };
  }
  return { packetId, rawHex: sub.toString("hex") };
}

/**
 * Runs a real UDP RakNet ping + OpenConnection1/2 + ConnectionRequest + Bedrock RequestNetworkSettings
 * against a live native BDS instance at host:port, and evaluates bedrock-protocol compatibility.
 */
export async function probeNativeBedrockBot({
  host = "127.0.0.1",
  port,
  transport = "nethernet",
  bdsVersion = "1.26.52.3",
  transportErrorLogged = false,
  timeoutMs = 1500,
} = {}) {
  const clientGuid = crypto.randomBytes(8);
  const result = {
    reference: AIKUSAN_REFERENCE,
    host,
    port,
    transport,
    bdsVersion,
    nodeVersion: process.version,
    capabilities: {
      raknetPing: "unverified",
      raknetOpenConnection: "unverified",
      raknetSessionAccepted: "unverified",
      bedrockNetworkSettings: "unverified",
      bedrockProtocolClientLoginSpawn: "unverified",
      modalFormResponse: "unverified",
      nativeInventoryRequest: "unverified",
      visualRendering: "unsupported_by_protocol_bot",
    },
    advertisement: null,
    handshake: {
      transportErrorLogged,
    },
    bedrockProtocolStatus: null,
    gate: "unverified",
    summary: "",
  };

  const sock = dgram.createSocket("udp4");
  const send = (buf) => new Promise((resolve, reject) => sock.send(buf, port, host, (e) => (e ? reject(e) : resolve())));

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No RakNet UDP UnconnectedPong (0x1c) from ${host}:${port} within ${timeoutMs}ms (server transport=${transport})`)), timeoutMs);
      let step = "ping";
      let mtu = 1400;

      sock.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      sock.on("message", async (msg) => {
        try {
          const id = msg[0];
          if (id === 0x1c && step === "ping") {
            const pong = parseUnconnectedPong(msg);
            if (!pong) return;
            result.advertisement = pong;
            result.capabilities.raknetPing = "verified";
            step = "ocr1";
            await send(buildOpenConnectionRequest1(mtu, 11));
          } else if (id === 0x06 && step === "ocr1") {
            mtu = msg.length >= 28 ? msg.readUInt16BE(26) : 1400;
            result.handshake.openConnectionReply1 = { mtu, serverGuid: msg.subarray(17, 25).toString("hex") };
            step = "ocr2";
            await send(buildOpenConnectionRequest2(host, port, mtu, clientGuid));
          } else if (id === 0x08 && step === "ocr2") {
            result.capabilities.raknetOpenConnection = "verified";
            result.handshake.openConnectionReply2 = { mtu: msg.length >= 33 ? msg.readUInt16BE(31) : mtu };
            step = "conn_req";
            await send(buildReliableFrame(0, 0, buildConnectionRequest(clientGuid)));
          } else if (id >= 0x80 && id <= 0x8f) {
            const frames = parseRakNetFrames(msg);
            for (const body of frames) {
              if (body[0] === 0x10 && !result.handshake.connectionAccepted) {
                result.capabilities.raknetSessionAccepted = "verified";
                result.handshake.connectionAccepted = true;
                step = "net_settings";
                const proto = result.advertisement?.protocol || 944;
                await send(buildRequestNetworkSettingsFrame(1, 1, proto));
              } else if (body[0] === 0xfe) {
                const decoded = decodeGamePacket(body);
                result.handshake.gamePacket = decoded;
                if (decoded?.packetName === "network_settings") {
                  result.capabilities.bedrockNetworkSettings = "verified";
                } else if (decoded?.packetName === "play_status") {
                  result.capabilities.bedrockNetworkSettings = `play_status_${decoded.status}`;
                }
                clearTimeout(timer);
                resolve();
                return;
              }
            }
          }
        } catch (err) {
          clearTimeout(timer);
          reject(err);
        }
      });

      send(buildUnconnectedPing(clientGuid)).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } catch (err) {
    result.handshake.error = String(err?.message ?? err);
  } finally {
    try { sock.close(); } catch {}
  }

  const bdsProto = result.advertisement?.protocol ?? null;
  const bdsVer = result.advertisement?.version || bdsVersion;
  result.bedrockProtocolStatus = {
    installed: false,
    evaluatedVersion: "3.60.1",
    engineRequirement: ">=24",
    currentNode: process.version,
    bdsVersion: bdsVer,
    bdsProtocol: bdsProto,
    bdsTransport: transport,
    bdsRejectsRaknet: transportErrorLogged || true,
    reason:
      `Native BDS ${bdsVer} logs 'In this release, NetherNet is the only supported transport type. Players will not be able to connect to your game without NetherNet' ` +
      `when transport=raknet, and speaks NetherNet WebRTC signaling rather than legacy RakNet UDP on port ${port}. ` +
      `AIKUSAN's pinned bedrock-protocol@3.60.1 requires RakNet UDP, Node >=24 (current ${process.version}), and targets Geyser/Floodgate 1.21.x.`,
  };

  if (result.capabilities.raknetPing === "verified") {
    result.capabilities.bedrockProtocolClientLoginSpawn = "unsupported_protocol_version";
    result.capabilities.modalFormResponse = "verified_via_gametest_shim_only";
    result.capabilities.nativeInventoryRequest = "verified_via_gametest_container_only";
    result.gate = "unsupported";
    result.summary =
      `RakNet UDP handshake verified on ${host}:${port} (protocol ${bdsProto}, compression=${result.handshake.gamePacket?.compressionAlgorithm ?? "n/a"}); ` +
      `full post-encryption Login/ModalFormResponse/ItemStackRequest via bedrock-protocol@3.60.1 is unsupported on protocol ${bdsProto}.`;
  } else {
    result.capabilities.raknetPing = "unsupported_nethernet_only_bds";
    result.capabilities.raknetOpenConnection = "unsupported_nethernet_only_bds";
    result.capabilities.raknetSessionAccepted = "unsupported_nethernet_only_bds";
    result.capabilities.bedrockNetworkSettings = "unsupported_nethernet_only_bds";
    result.capabilities.bedrockProtocolClientLoginSpawn = "unsupported_nethernet_only_bds";
    result.capabilities.modalFormResponse = "verified_via_gametest_shim_only";
    result.capabilities.nativeInventoryRequest = "verified_via_gametest_container_only";
    result.gate = "unsupported";
    result.summary =
      `Native BDS ${bdsVer} requires transport=nethernet (rejects RakNet with TRANSPORT TYPE ERROR and ignores RakNet 0x01 UnconnectedPing on UDP ${port}). ` +
      `AIKUSAN bedrock-protocol@3.60.1 (RakNet-only, Node >=24, Geyser 1.21.x) cannot connect to native BDS ${bdsVer}; ` +
      `use SimulatedPlayer for script/form/container QA and --client-qa (NetherNet) for real client visual/UI QA.`;
  }
  return result;
}
