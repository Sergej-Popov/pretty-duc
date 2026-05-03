import { normalizeDucPath } from '@pretty-duc/config';
import { ApiError } from './errors';

export function resolveRequestedPath(rootPath: string, requestedPath: string): string {
  if (!requestedPath || requestedPath.includes('\u0000')) {
    throw new ApiError(422, 'INVALID_PATH', 'Path must be a non-empty string');
  }

  const normalized = normalizeDucPath(requestedPath);

  if (normalized !== rootPath && !normalized.startsWith(`${rootPath}/`)) {
    throw new ApiError(403, 'PATH_OUTSIDE_ROOT', 'Path must be under configured root', {
      rootPath,
      requestedPath: normalized
    });
  }

  return normalized;
}

export function joinChildPath(parentPath: string, childName: string): string {
  const trimmedName = childName.replace(/\/+$/, '');
  return parentPath === '/' ? `/${trimmedName}` : `${parentPath}/${trimmedName}`;
}
