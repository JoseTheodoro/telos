import type { NodeKey, NodeKind } from "./types.ts";

export const nodeKey = (kind: NodeKind | string, id: string): NodeKey => kind + ":" + id;

export const keyKind = (k: NodeKey): NodeKind => String(k).split(":")[0] as NodeKind;

/** Id da entidade a partir da chave (preserva ids que contenham ":"). */
export const keyId = (k: NodeKey): string => String(k).split(":").slice(1).join(":");

export const newId = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
