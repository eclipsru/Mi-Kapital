package ru.eclipsru.mikapital;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

public class UpdateFilesTest {
  public static void main(String[] args) throws Exception {
    Path temp = Files.createTempDirectory("mi-kapital-update-test");
    File cachedFile = temp.resolve("updates/cache/hash").toFile();
    UpdateFiles.ensureParent(cachedFile);
    Files.write(cachedFile.toPath(), new byte[] {1});
    UpdateFiles.ensureParent(cachedFile); // An existing cache works too.
    Path blocked = temp.resolve("blocked");
    Files.write(blocked, new byte[] {1});
    try {
      UpdateFiles.ensureParent(blocked.resolve("cache/hash").toFile());
      throw new AssertionError("Must fail when the parent cannot be created");
    } catch (IOException expected) {
      // A failed cache setup should be reported, not silently accepted.
    }
    System.out.println("Fresh and existing update cache tests passed");
  }
}
