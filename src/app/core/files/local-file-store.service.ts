import { computed, inject, Injectable, OnDestroy } from '@angular/core';

import { Backend, json, Operation, remote } from '../data-access/backend';
import { LocalAttachment } from '@shared/models/attachment';
import { SessionService } from '../identity/session.service';
export type { LocalAttachment } from '@shared/models/attachment';
export type FilePurpose = 'clinical' | 'receipt';
export interface UploadTarget {
  purpose: FilePurpose;
  patientId?: string;
  visibility?: 'shared' | 'private';
  settlementId?: string;
}
@Injectable({ providedIn: 'root' })
export class LocalFileStore implements OnDestroy {
  private readonly backend = inject(Backend);
  private readonly session = inject(SessionService);
  readonly available = computed(() => !!this.session.user());
  private readonly files = new Map<
    string,
    { attachment: LocalAttachment; file: File; operation: Operation; uploaded?: LocalAttachment }
  >();
  private readonly urls = new Set<string>();
  private generation = 0;
  private readonly onClear = () => this.clear();
  constructor() {
    window.addEventListener('hamacar:lock', this.onClear);
    window.addEventListener('hamacar:identity-change', this.onClear);
  }
  add(file: File, purpose: FilePurpose): LocalAttachment {
    const ext = file.name.split('.').at(-1)?.toLowerCase() ?? '';
    const types: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    if (!types[ext] || (purpose === 'receipt' && ['doc', 'docx'].includes(ext)))
      throw new Error('Formato de archivo no admitido.');
    if (!file.size || file.size > 10485760)
      throw new Error('Cada archivo debe pesar entre 1 byte y 10 MB.');
    const attachment = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      type: types[ext],
      url: URL.createObjectURL(file),
      lastModified: file.lastModified,
      persisted: false,
    };
    this.urls.add(attachment.url);
    this.files.set(attachment.id, { attachment, file, operation: new Operation() });
    return attachment;
  }
  get(id: string): LocalAttachment | undefined {
    return this.files.get(id)?.attachment;
  }
  file(id: string): File | undefined {
    return this.files.get(id)?.file;
  }
  async upload(attachment: LocalAttachment, target: UploadTarget): Promise<LocalAttachment> {
    if (attachment.persisted) return attachment;
    const local = this.files.get(attachment.id);
    const generation = this.generation;
    if (!local)
      throw new Error(
        'Volvé a seleccionar el archivo; la sesión anterior liberó la copia temporal.',
      );
    if (local.uploaded) return local.uploaded;
    const payload = {
      ...target,
      name: attachment.name,
      size: attachment.size,
      type: attachment.type,
    };
    const reserved = (await this.backend.call('upload_reserve', {
      p_input: json(payload),
      p_operation: local.operation.key(payload),
    })) as { id: string; bucket: string; path: string };
    if (generation !== this.generation)
      throw new Error('La sesión se bloqueó. Reintentá después de ingresar.');
    const { error: uploadError } = await this.backend.client.storage
      .from(reserved.bucket)
      .upload(reserved.path, local.file, {
        contentType: attachment.type,
        upsert: false,
        cacheControl: '0',
      });
    if (
      uploadError &&
      !['409', '400'].includes(String((uploadError as { statusCode?: string }).statusCode))
    )
      throw new Error('No se pudo cargar el archivo. Reintentá.');
    const { data, error } = await this.backend.client.functions.invoke('finalize-upload', {
      body: { id: reserved.id },
    });
    if (error || data?.error)
      throw new Error(
        data?.error ?? 'No se pudo validar el archivo. Reintentá o seleccioná otro archivo.',
      );
    if (generation !== this.generation)
      throw new Error('La sesión se bloqueó. El archivo aún no se asoció al registro.');
    local.uploaded = {
      id: data.id,
      name: data.name,
      size: data.size,
      type: data.type,
      url: '',
      lastModified: 0,
      persisted: true,
    };
    return local.uploaded;
  }
  download(id: string) {
    return remote<Blob>((signal) =>
      this.backend.client.functions.invoke('download-file', { body: { id }, signal }),
    );
  }
  createUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }
  revoke(url: string): void {
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }
  remove(id: string): void {
    const local = this.files.get(id);
    if (local) this.revoke(local.attachment.url);
    this.files.delete(id);
  }
  clear(): void {
    this.generation++;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.files.clear();
  }
  ngOnDestroy(): void {
    window.removeEventListener('hamacar:lock', this.onClear);
    window.removeEventListener('hamacar:identity-change', this.onClear);
    this.clear();
  }
}
