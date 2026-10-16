import { computed, Injectable, OnDestroy, signal } from '@angular/core';

type DictationState =
  'idle' | 'preparing' | 'ready' | 'permission' | 'recording' | 'paused' | 'transcribing' | 'error';

/** Captura local. El worker descarga el modelo público; nunca envía audio a una API. */
@Injectable()
export class LocalDictation implements OnDestroy {
  readonly state = signal<DictationState>('idle');
  readonly message = signal('Experimental · Hasta 60 segundos por dictado.');
  readonly seconds = signal(0);
  readonly transcript = signal('');
  readonly busy = computed(() =>
    ['preparing', 'permission', 'recording', 'paused', 'transcribing'].includes(this.state()),
  );
  private worker?: Worker;
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private chunks: Float32Array[] = [];
  private samples = 0;
  private rate = 48000;
  private peak = 0;
  private generation = 0;
  private ready = false;
  private timer?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;
  private flushed?: () => void;
  private readonly onHidden = () => {
    if (document.hidden) this.pause();
  };
  private readonly onPageHide = () => this.cancel();

  constructor() {
    document.addEventListener('visibilitychange', this.onHidden);
    window.addEventListener('pagehide', this.onPageHide);
  }
  prepare(): void {
    if (this.busy()) return;
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.AudioWorkletNode ||
      !window.Worker ||
      !window.OfflineAudioContext
    ) {
      this.fail('El dictado no está disponible en este dispositivo. Podés seguir escribiendo.');
      return;
    }
    this.cancel();
    const token = this.generation;
    this.state.set('preparing');
    this.message.set('Descargando Whisper Tiny. Todavía no se graba audio.');
    try {
      this.worker = new Worker(new URL('workers/voice-worker.js', document.baseURI), {
        type: 'module',
      });
      this.deadline = setTimeout(
        () => this.fail('No se pudo preparar el modelo. Revisá tu conexión.'),
        180_000,
      );
      this.worker.onerror = () => {
        if (token === this.generation) this.fail('No se pudo ejecutar el modelo local.');
      };
      this.worker.onmessage = ({
        data,
      }: MessageEvent<{ type: string; label?: string; text?: string }>) => {
        if (token !== this.generation) return;
        if (data.type === 'progress') this.message.set(data.label ?? 'Preparando modelo…');
        if (data.type === 'ready') {
          clearTimeout(this.deadline);
          this.ready = true;
          this.state.set('ready');
          this.message.set('Listo. Tocá Dictar para habilitar el micrófono.');
        }
        if (data.type === 'error')
          this.fail('No se pudo completar el dictado. Tu texto anterior se conserva.');
        if (data.type === 'result' && this.state() === 'transcribing') {
          clearTimeout(this.deadline);
          this.transcript.set(data.text?.trim() ?? '');
          this.erase();
          this.state.set('ready');
          this.message.set(
            data.text?.trim()
              ? 'Transcripción agregada. Revisala antes de guardar.'
              : 'No se obtuvo una transcripción.',
          );
        }
      };
      this.worker.postMessage({ type: 'prepare' });
    } catch {
      this.fail('El dictado local no está disponible.');
    }
  }
  async start(): Promise<void> {
    if (this.busy()) return;
    if (!this.ready) {
      this.prepare();
      return;
    }
    const token = this.generation;
    this.erase();
    this.state.set('permission');
    this.message.set('Permití el micrófono en el navegador.');
    let acquired: MediaStream | undefined;
    try {
      const context = new AudioContext();
      this.context = context;
      await context.resume();
      acquired = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (token !== this.generation) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = acquired;
      this.rate = context.sampleRate;
      await context.audioWorklet.addModule(new URL('workers/voice-capture.js', document.baseURI));
      if (token !== this.generation) return;
      this.source = context.createMediaStreamSource(acquired);
      this.node = new AudioWorkletNode(context, 'hamacar-capture');
      this.node.port.onmessage = ({
        data,
      }: MessageEvent<{ samples?: Float32Array; flushed?: boolean }>) => {
        if (data.flushed) {
          this.flushed?.();
          this.flushed = undefined;
          return;
        }
        if (!data.samples) return;
        const chunk = data.samples.subarray(0, Math.max(0, this.rate * 60 - this.samples));
        if (chunk.length) {
          this.chunks.push(chunk);
          this.samples += chunk.length;
          this.peak = Math.max(
            this.peak,
            Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length),
          );
        }
        this.seconds.set(Math.min(60, Math.floor(this.samples / this.rate)));
        if (this.samples >= this.rate * 60 && this.state() === 'recording') void this.finish();
      };
      this.source.connect(this.node);
      this.node.connect(context.destination);
      this.state.set('recording');
      this.message.set('Escuchando…');
      acquired.getTracks().forEach((track) => {
        track.onended = () => {
          if (['recording', 'paused'].includes(this.state()))
            this.fail('Se desconectó el micrófono.');
        };
      });
    } catch (error) {
      acquired?.getTracks().forEach((t) => t.stop());
      if (token === this.generation)
        this.fail(
          error instanceof DOMException && error.name === 'NotAllowedError'
            ? 'No se habilitó el micrófono. Podés seguir escribiendo.'
            : 'No se pudo iniciar el micrófono.',
        );
    }
  }
  pause(): void {
    if (this.state() !== 'recording') return;
    this.node?.port.postMessage('pause');
    this.stream?.getTracks().forEach((t) => {
      t.enabled = false;
    });
    this.state.set('paused');
  }
  async resume(): Promise<void> {
    if (this.state() !== 'paused') return;
    const token = this.generation;
    try {
      await this.context?.resume();
      if (token !== this.generation) return;
      this.stream?.getTracks().forEach((t) => {
        t.enabled = true;
      });
      this.node?.port.postMessage('resume');
      this.state.set('recording');
    } catch {
      this.fail('No se pudo continuar el dictado.');
    }
  }
  async finish(): Promise<void> {
    if (!['recording', 'paused'].includes(this.state())) return;
    const token = this.generation;
    this.state.set('transcribing');
    this.message.set('Transcribiendo en este dispositivo…');
    if (this.node)
      await new Promise<void>((resolve) => {
        this.flushed = resolve;
        this.node!.port.postMessage('flush');
        setTimeout(resolve, 500);
      });
    if (token !== this.generation) return;
    this.stopCapture();
    if (this.samples < this.rate * 0.4 || this.peak < 0.002) {
      this.erase();
      this.state.set('ready');
      this.message.set('No se detectó audio suficiente.');
      return;
    }
    let audio: Float32Array | undefined = new Float32Array(this.samples);
    let offset = 0;
    for (const chunk of this.chunks) {
      audio.set(chunk, offset);
      offset += chunk.length;
      chunk.fill(0);
    }
    this.chunks = [];
    try {
      const offline = new OfflineAudioContext(
        1,
        Math.ceil((audio.length * 16000) / this.rate),
        16000,
      );
      const buffer = offline.createBuffer(1, audio.length, this.rate);
      buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
      audio.fill(0);
      audio = undefined;
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      buffer.getChannelData(0).fill(0);
      const pcm = new Float32Array(rendered.getChannelData(0));
      rendered.getChannelData(0).fill(0);
      if (token !== this.generation) {
        pcm.fill(0);
        return;
      }
      this.worker?.postMessage({ type: 'transcribe', audio: pcm }, [pcm.buffer]);
      this.deadline = setTimeout(
        () => this.fail('La transcripción tardó demasiado. El audio se descartó.'),
        90_000,
      );
    } catch {
      audio?.fill(0);
      if (token === this.generation) this.fail('No se pudo procesar el audio.');
    }
  }
  cancel(): void {
    this.generation++;
    this.stopCapture();
    this.erase();
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = false;
    clearTimeout(this.deadline);
    this.transcript.set('');
    this.state.set('idle');
  }
  private fail(message: string): void {
    this.cancel();
    this.state.set('error');
    this.message.set(message);
  }
  private erase(): void {
    this.chunks.forEach((chunk) => chunk.fill(0));
    this.chunks = [];
    this.samples = 0;
    this.peak = 0;
    this.seconds.set(0);
  }
  private stopCapture(): void {
    clearInterval(this.timer);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
    this.stream = undefined;
    this.source?.disconnect();
    this.source = undefined;
    this.node?.disconnect();
    this.node = undefined;
    void this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.flushed?.();
    this.flushed = undefined;
  }
  ngOnDestroy(): void {
    this.cancel();
    document.removeEventListener('visibilitychange', this.onHidden);
    window.removeEventListener('pagehide', this.onPageHide);
  }
}
