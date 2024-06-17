import dedent from 'ts-dedent';
import { sync as findUpSync } from 'find-up';
import path from 'path';
import { JsPackageManager } from './JsPackageManager';
import type { PackageJson } from './PackageJson';
import type { InstallationMetadata, PackageMetadata } from './types';
import { createLogStream } from '../utils/cli';
import { existsSync, readFileSync } from 'fs';

type BunDependency = {
  from: string;
  version: string;
  resolved: string;
  dependencies?: BunDependencies;
};

type BunDependencies = {
  [key: string]: BunDependency;
};

type BunListItem = {
  dependencies: BunDependencies;
  peerDependencies: BunDependencies;
  devDependencies: BunDependencies;
};

export type BunListOutput = BunListItem[];

const PNPM_ERROR_REGEX = /(ELIFECYCLE|ERR_PNPM_[A-Z_]+)\s+(.*)/i;

export class BunProxy extends JsPackageManager {
  readonly type = 'bun';

  installArgs: string[] | undefined;

  async initPackageJson() {
    await this.executeCommand({ command: 'bun', args: ['init'] });
  }

  getRunStorybookCommand(): string {
    return 'bun run storybook';
  }

  getRunCommand(command: string): string {
    return `bun run ${command}`;
  }

  public runPackageCommandSync(
    command: string,
    args: string[],
    cwd?: string,
    stdio?: 'pipe' | 'inherit'
  ): string {
    return this.executeCommandSync({
      command: 'bun',
      args: ['run', command, ...args],
      cwd,
      stdio,
    });
  }

  async runPackageCommand(command: string, args: string[], cwd?: string): Promise<string> {
    return this.executeCommand({
      command: 'bun',
      args: ['run', command, ...args],
      cwd,
    });
  }

  public async findInstallations(pattern: string[]) {
    // TODO: Bun doesn't output the file as json. Only as yarn v1 text output.
    return undefined;
    // const commandResult = await this.executeCommand({
    //   command: 'bun',
    //   args: ['list', pattern.map((p) => `"${p}"`).join(' '), '--json', '--depth=99'],
    //   env: {
    //     FORCE_COLOR: 'false',
    //   },
    // });

    // try {
    //   const parsedOutput = JSON.parse(commandResult);
    //   return this.mapDependencies(parsedOutput, pattern);
    // } catch (e) {
    //   return undefined;
    // }
  }

  public async getPackageJSON(
    packageName: string,
    basePath = this.cwd
  ): Promise<PackageJson | null> {
    const packageJsonPath = await findUpSync(
      (dir) => {
        const possiblePath = path.join(dir, 'node_modules', packageName, 'package.json');
        return existsSync(possiblePath) ? possiblePath : undefined;
      },
      { cwd: basePath }
    );

    if (!packageJsonPath) {
      return null;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson;
  }

  protected getResolutions(packageJson: PackageJson, versions: Record<string, string>) {
    return {
      overrides: {
        ...packageJson.overrides,
        ...versions,
      },
    };
  }

  protected async runInstall() {
    await this.executeCommand({
      command: 'bun',
      args: ['install'],
      stdio: 'inherit',
    });
  }

  protected async runAddDeps(dependencies: string[], installAsDevDependencies: boolean) {
    let args = [...dependencies];

    if (installAsDevDependencies) {
      args = ['--dev', ...args];
    }
    const { logStream, readLogFile, moveLogFile, removeLogFile } = await createLogStream();

    try {
      await this.executeCommand({
        command: 'bun',
        args: ['add', ...args],
        stdio: process.env.CI ? 'inherit' : ['ignore', logStream, logStream],
      });
    } catch (err) {
      const stdout = await readLogFile();

      const errorMessage = this.parseErrorFromLogs(stdout);

      await moveLogFile();

      throw new Error(
        dedent`${errorMessage}
        
        Please check the logfile generated at ./storybook.log for troubleshooting and try again.`
      );
    }

    await removeLogFile();
  }

  protected async runRemoveDeps(dependencies: string[]) {
    const args = [...dependencies];

    await this.executeCommand({
      command: 'bun',
      args: ['remove', ...args],
      stdio: 'inherit',
    });
  }

  protected async runGetVersions<T extends boolean>(
    packageName: string,
    fetchAllVersions: T
  ): Promise<T extends true ? string[] : string> {
    // TODO: bun doesn't implement this command yet
    // const args = [fetchAllVersions ? 'versions' : 'version', '--json'];
    // const commandResult = await this.executeCommand({
    //   command: 'pnpm',
    //   args: ['info', packageName, ...args],
    // });

    // try {
    //   const parsedOutput = JSON.parse(commandResult);

    //   if (parsedOutput.error) {
    //     // FIXME: improve error handling
    //     throw new Error(parsedOutput.error.summary);
    //   } else {
    //     return parsedOutput;
    //   }
    // } catch (e) {
    //   throw new Error(`Unable to find versions of ${packageName} using pnpm`);
    // }
    return fetchAllVersions ? [''] : '';
  }

  // protected mapDependencies(input: BunListOutput, pattern: string[]): InstallationMetadata {
  //   const acc: Record<string, PackageMetadata[]> = {};
  //   const existingVersions: Record<string, string[]> = {};
  //   const duplicatedDependencies: Record<string, string[]> = {};
  //   const items: BunDependencies = input.reduce((curr, item) => {
  //     const { devDependencies, dependencies, peerDependencies } = item;
  //     const allDependencies = { ...devDependencies, ...dependencies, ...peerDependencies };
  //     return Object.assign(curr, allDependencies);
  //   }, {} as BunDependencies);

  //   const recurse = ([name, packageInfo]: [string, BunDependency]): void => {
  //     // transform pattern into regex where `*` is replaced with `.*`
  //     if (!name || !pattern.some((p) => new RegExp(`^${p.replace(/\*/g, '.*')}$`).test(name))) {
  //       return;
  //     }

  //     const value = {
  //       version: packageInfo.version,
  //       location: '',
  //     };

  //     if (!existingVersions[name]?.includes(value.version)) {
  //       if (acc[name]) {
  //         acc[name].push(value);
  //       } else {
  //         acc[name] = [value];
  //       }
  //       existingVersions[name] = [...(existingVersions[name] || []), value.version];

  //       if (existingVersions[name].length > 1) {
  //         duplicatedDependencies[name] = existingVersions[name];
  //       }
  //     }

  //     if (packageInfo.dependencies) {
  //       Object.entries(packageInfo.dependencies).forEach(recurse);
  //     }
  //   };
  //   Object.entries(items).forEach(recurse);

  //   return {
  //     dependencies: acc,
  //     duplicatedDependencies,
  //     infoCommand: 'pnpm list --depth=1',
  //     dedupeCommand: 'pnpm dedupe',
  //   };
  // }

  public parseErrorFromLogs(logs: string): string {
    // TODO
    return '';
    // let finalMessage = 'PNPM error';
    // const match = logs.match(PNPM_ERROR_REGEX);
    // if (match) {
    //   const [errorCode] = match;
    //   if (errorCode) {
    //     finalMessage = `${finalMessage} ${errorCode}`;
    //   }
    // }

    // return finalMessage.trim();
  }
}
