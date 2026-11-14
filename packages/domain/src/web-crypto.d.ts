// O domínio roda no navegador e no Node 26, os dois com Web Crypto global; a lib DOM traria para o pacote puro tipos de UI que ele não pode usar.
declare const crypto: { randomUUID(): string };
