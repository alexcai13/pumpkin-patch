import type { RtcRelay, RtcSignal } from "../../../../shared/messages";
import type { PatchRoom } from "./Network";

/**
 * LIVE VIDEO FOR THE PHOTO BOOTH (WebRTC)
 * ---------------------------------------
 * WebRTC lets two browsers send video straight to each other. To connect,
 * they first swap a few setup messages ("offer", "answer", and "ice"
 * network-route candidates). We send those through the game server
 * (message type "rtc"), which just passes them to the other player.
 *
 * Roles: the player in slot 0 is the CALLER (makes the offer); slot 1 is the
 * CALLEE (answers). A fresh offer always replaces any old connection, so
 * re-entering the booth just works.
 *
 * STUN (below) helps each browser discover its public address. Most home
 * networks connect fine with just that. If two players on very strict
 * networks can't see each other, add a TURN relay server via the
 * VITE_TURN_URL / VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL env vars.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ...(import.meta.env.VITE_TURN_URL
    ? [{
        urls: import.meta.env.VITE_TURN_URL as string,
        username: import.meta.env.VITE_TURN_USERNAME as string,
        credential: import.meta.env.VITE_TURN_CREDENTIAL as string,
      }]
    : []),
];

export type RtcStatus = "idle" | "connecting" | "connected" | "failed";

export class BoothRtc {
  localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  /** Human-readable reason if we couldn't get a camera. */
  cameraError: string | null = null;
  status: RtcStatus = "idle";

  private pc?: RTCPeerConnection;
  private pendingIce: RTCIceCandidateInit[] = [];
  private unbind?: () => void;

  constructor(private room: PatchRoom) {
    const off = room.onMessage("rtc", (msg: RtcRelay) => { void this.handleSignal(msg.signal); });
    this.unbind = typeof off === "function" ? off : undefined;
  }

  /** Ask for the webcam (the browser shows a permission prompt the first time). */
  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraError = window.isSecureContext
        ? "This browser can't use a camera."
        : "Cameras only work on https:// or localhost.";
      return;
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: "user" },
        audio: false,
      });
      this.cameraError = null;
      // If we're already connected, start sending the new camera.
      const sender = this.pc?.getTransceivers()[0]?.sender;
      if (sender) await sender.replaceTrack(this.videoTrack());
    } catch (err) {
      const name = (err as DOMException)?.name;
      this.cameraError = name === "NotAllowedError" ? "Camera permission was blocked." :
        name === "NotFoundError" ? "No camera found." : "Couldn't start the camera.";
    }
  }

  private videoTrack() {
    return this.localStream?.getVideoTracks()[0] ?? null;
  }

  /** CALLER: start a fresh connection to the other player. */
  async connect() {
    const pc = this.newConnection();
    // One two-way video channel. We send our camera if we have one (or
    // nothing — you can still SEE your friend without a camera of your own).
    const tr = pc.addTransceiver("video", { direction: "sendrecv" });
    await tr.sender.replaceTrack(this.videoTrack());
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ kind: "offer", sdp: offer.sdp ?? "" });
  }

  private async handleSignal(signal: RtcSignal) {
    try {
      if (signal.kind === "offer") {
        // CALLEE: a new offer replaces any previous connection.
        const pc = this.newConnection();
        await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        const tr = pc.getTransceivers()[0];
        if (tr) {
          tr.direction = "sendrecv";
          await tr.sender.replaceTrack(this.videoTrack());
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.send({ kind: "answer", sdp: answer.sdp ?? "" });
        await this.flushIce();
      } else if (signal.kind === "answer") {
        if (!this.pc || this.pc.signalingState !== "have-local-offer") return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await this.flushIce();
      } else if (signal.kind === "ice") {
        // Candidates can arrive before the offer/answer is applied: queue them.
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(signal.candidate);
        else this.pendingIce.push(signal.candidate);
      }
    } catch (err) {
      console.warn("Photo booth video setup failed:", err);
      this.status = "failed";
    }
  }

  private async flushIce() {
    const queued = this.pendingIce;
    this.pendingIce = [];
    for (const c of queued) await this.pc?.addIceCandidate(c).catch(() => {});
  }

  private newConnection() {
    this.disconnect();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc = pc;
    this.status = "connecting";
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ kind: "ice", candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => { this.remoteStream = e.streams[0] ?? new MediaStream([e.track]); };
    pc.onconnectionstatechange = () => {
      if (pc !== this.pc) return;
      if (pc.connectionState === "connected") this.status = "connected";
      if (pc.connectionState === "failed") this.status = "failed";
    };
    return pc;
  }

  private send(signal: RtcSignal) {
    this.room.send("rtc", signal);
  }

  /** Drop the connection to the other player (keeps our own camera on). */
  disconnect() {
    this.pc?.close();
    this.pc = undefined;
    this.pendingIce = [];
    this.remoteStream = null;
    this.status = "idle";
  }

  /** Close everything, including our camera light. */
  destroy() {
    this.disconnect();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.unbind?.();
  }
}
