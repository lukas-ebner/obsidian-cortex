/**
 * Maps between local Obsidian vault paths and server-side paths.
 *
 * Example:
 *   localVaultRoot  = "/Users/lukas/Obsidian-Cloud"  (from app.vault.adapter.basePath)
 *   serverVaultRoot = "/app/data/lukas-vault/Obsidian-Cloud"
 *
 *   TFolder.path = "sperling"
 *     → toServerRelPath("sperling")
 *     → "lukas-vault/Obsidian-Cloud/sperling"
 *
 *   TFolder.path = "sperling"
 *     → toServerAbsPath("sperling")
 *     → "/app/data/lukas-vault/Obsidian-Cloud/sperling"
 */
export class PathMapper {
  constructor(
    private serverVaultRoot: string, // e.g. "/app/data/lukas-vault/Obsidian-Cloud"
    private projectRoot: string // e.g. "/app/data" (from folders API response)
  ) {}

  /**
   * Convert Obsidian TFolder.path to the relative path used by the folders API.
   * TFolder.path is relative to vault root (e.g. "sperling" or "Filme").
   */
  toServerRelPath(localPath: string): string {
    const abs = this.toServerAbsPath(localPath);
    const root = this.projectRoot.replace(/\/+$/, "");
    if (abs.startsWith(root + "/")) {
      return abs.slice(root.length + 1);
    }
    return abs.replace(/^\/+/, "");
  }

  /**
   * Convert Obsidian TFolder.path to absolute server path.
   */
  toServerAbsPath(localPath: string): string {
    const root = this.serverVaultRoot.replace(/\/+$/, "");
    if (!localPath || localPath === "/") {
      return root;
    }
    return `${root}/${localPath}`;
  }

  /**
   * Convert server relative path back to Obsidian TFolder.path.
   */
  fromServerRelPath(serverRelPath: string): string | null {
    const root = this.serverVaultRoot.replace(/\/+$/, "");
    const projectRootClean = this.projectRoot.replace(/\/+$/, "");
    const abs = `${projectRootClean}/${serverRelPath}`;

    if (abs.startsWith(root + "/")) {
      return abs.slice(root.length + 1);
    }
    if (abs === root) {
      return "";
    }
    return null; // Path not within our vault
  }
}
