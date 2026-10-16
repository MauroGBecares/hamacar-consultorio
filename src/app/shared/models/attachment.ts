/** La URL blob es temporal; solo el identificador validado se asocia en el servidor. */
export interface LocalAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  lastModified: number;
  persisted?: boolean;
}
