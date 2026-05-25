import type { SceneElement } from '@arcadery/shared/schemas';

export type AiMode = 'modify' | 'generate';

export interface AiContext {
  selectedElement: SceneElement | null;
  elementCount: number;
  elementTypes: string[];
}

export interface AiGenerateRequest {
  prompt: string;
  context: AiContext;
  mode: AiMode;
  /** Optional reference image: either a data: URL or an https URL pointing at
   *  a user-uploaded asset. Server fetches/decodes and passes it to Claude as
   *  an image block so the model can actually look at the image. Image-bearing
   *  requests always route to Claude (Sonnet), since DeepSeek is text-only. */
  refImage?: string;
}
