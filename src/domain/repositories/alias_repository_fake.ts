import { Result } from "../../shared/result.ts";
import { Alias } from "../models/alias.ts";
import { AliasRepository } from "./alias_repository.ts";
import { AliasSlug } from "../primitives/mod.ts";
import { RepositoryError } from "./repository_error.ts";

const ok = Result.ok;

export class InMemoryAliasRepository implements AliasRepository {
  private readonly aliases = new Map<string, Alias>();

  constructor(initial?: Iterable<Alias>) {
    if (initial) {
      for (const alias of initial) {
        this.aliases.set(alias.data.slug.canonicalKey.toString(), alias);
      }
    }
  }

  load(slug: AliasSlug): Promise<Result<Alias | undefined, RepositoryError>> {
    return Promise.resolve(ok(this.aliases.get(slug.canonicalKey.toString())));
  }

  save(alias: Alias): Promise<Result<void, RepositoryError>> {
    this.aliases.set(alias.data.slug.canonicalKey.toString(), alias);
    return Promise.resolve(ok(undefined));
  }

  delete(slug: AliasSlug): Promise<Result<void, RepositoryError>> {
    this.aliases.delete(slug.canonicalKey.toString());
    return Promise.resolve(ok(undefined));
  }

  list(): Promise<Result<ReadonlyArray<Alias>, RepositoryError>> {
    return Promise.resolve(ok(Array.from(this.aliases.values())));
  }

  clear(): void {
    this.aliases.clear();
  }

  set(alias: Alias): void {
    this.aliases.set(alias.data.slug.canonicalKey.toString(), alias);
  }
}
