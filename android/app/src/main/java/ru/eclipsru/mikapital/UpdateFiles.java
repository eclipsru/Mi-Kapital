package ru.eclipsru.mikapital;

import java.io.File;
import java.io.IOException;

/** Prepares storage even on a fresh installation with no update cache yet. */
final class UpdateFiles {
  static void ensureParent(File file) throws IOException {
    File parent = file.getParentFile();
    if (parent == null || (!parent.isDirectory() && !parent.mkdirs() && !parent.isDirectory())) {
      throw new IOException("Не удалось создать папку обновлений");
    }
  }
}
