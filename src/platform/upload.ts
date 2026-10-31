import { useCallback, useState } from 'react';
import { saveFile } from './files';

/** Local replacement for the hosted file-upload hook. Same call shape: `upload(file) → { url }`. */
export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const upload = useCallback(async (file: File): Promise<{ url: string; name: string; size: number; type: string }> => {
    setIsUploading(true);
    try {
      const saved = await saveFile(file);
      return { url: saved.url, name: saved.name, size: saved.size, type: saved.type };
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { upload, isUploading };
}
