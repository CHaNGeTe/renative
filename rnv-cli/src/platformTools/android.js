import path from 'path';
import fs from 'fs';
import shell from 'shelljs';
import child_process from 'child_process';
import { executeAsync, execShellAsync, execCLI } from '../exec';
import {
    isPlatformSupported, getConfig, logTask, logComplete, logError,
    getAppFolder, isPlatformActive, configureIfRequired,
    CLI_ANDROID_EMULATOR, CLI_ANDROID_ADB, CLI_TIZEN_EMULATOR, CLI_TIZEN, CLI_WEBOS_ARES,
    CLI_WEBOS_ARES_PACKAGE, CLI_WEBBOS_ARES_INSTALL, CLI_WEBBOS_ARES_LAUNCH,
    getAppVersion, getAppTitle, getAppVersionCode, writeCleanFile, getAppId, getAppTemplateFolder,
    getEntryFile,
} from '../common';
import { cleanFolder, copyFolderContentsRecursiveSync, copyFolderRecursiveSync, copyFileSync, mkdirSync } from '../fileutils';


function launchAndroidSimulator(c, name) {
    logTask('launchAndroidSimulator');

    if (name) {
        return execCLI(c, CLI_ANDROID_EMULATOR, `-avd "${name}"`);
    }
    return Promise.reject('No simulator -t target name specified!');
}

const EMU_KEYS = ['emulator-', 'product:', 'model:', 'device:'];
const listAndroidTargets = c => new Promise((resolve, reject) => {
    logTask('listAndroidTargets');

    const ch = child_process.spawn('adb', ['devices', '-l'], { stdio: 'pipe', detached: true });
    ch.stdout.on('data', (data) => {
        const d = data.toString().match(/[^\r?\n]+/g);
        d.shift();
        const output = [];
        d.forEach((v) => {
            const obj = {
                status: 'active',
            };
            const vArr = v.split(' ');
            vArr.forEach((i) => {
                EMU_KEYS.forEach((ek) => {
                    if (i.startsWith(ek)) {
                        const key = ek.replace(/-/g, '').replace(/:/g, '');
                        obj[key] = i.split(ek)[1];
                    }
                });
            });
            output.push(obj);
        });
        resolve(output);
    });
    ch.stderr.on('data', (data) => {
        log(`stderr: ${data}`);
        reject(data);
    });
});

const copyAndroidAssets = (c, platform) => new Promise((resolve, reject) => {
    logTask('copyAndroidAssets');
    if (!isPlatformActive(c, platform, resolve)) return;

    const destPath = path.join(getAppFolder(c, platform), 'app/src/main/res');
    const sourcePath = path.join(c.appConfigFolder, `assets/${platform}/res`);
    copyFolderContentsRecursiveSync(sourcePath, destPath);
    resolve();
});

const packageAndroid = (c, platform) => new Promise((resolve, reject) => {
    logTask('packageAndroid');

    const appFolder = getAppFolder(c, platform);
    executeAsync('react-native', [
        'bundle',
        '--platform',
        'android',
        '--dev',
        'false',
        '--assets-dest',
        `${appFolder}/app/src/main/res`,
        '--entry-file',
        `${c.appConfigFile.platforms[platform].entryFile}.js`,
        '--bundle-output',
        `${appFolder}/app/src/main/assets/index.android.bundle`,
    ]).then(() => resolve()).catch(e => reject(e));
});

const runAndroid = (c, platform, target) => new Promise((resolve, reject) => {
    logTask(`runAndroid:${platform}:${target}`);


    const appFolder = getAppFolder(c, platform);

    shell.cd(`${appFolder}`);
    shell.exec('./gradlew appStart', resolve, (e) => {
        logError(e);
    });
});

const configureAndroidProperties = c => new Promise((resolve, reject) => {
    logTask('configureAndroidProperties');

    const localProperties = path.join(c.globalConfigFolder, 'local.properties');
    if (fs.existsSync(localProperties)) {
        console.log('local.properties file exists!');
    } else {
        console.log('local.properties file missing! Creating one for you...');
    }

    fs.writeFileSync(localProperties, `#Generated by RNV
ndk.dir=${c.globalConfig.sdks.ANDROID_NDK}
sdk.dir=${c.globalConfig.sdks.ANDROID_SDK}`);

    resolve();
});

const configureGradleProject = (c, platform) => new Promise((resolve, reject) => {
    logTask(`configureGradleProject:${platform}`);

    if (!isPlatformActive(c, platform, resolve)) return;

    // configureIfRequired(c, platform)
    //     .then(() => configureAndroidProperties(c, platform))
    configureAndroidProperties(c, platform)
        .then(() => copyAndroidAssets(c, platform))
        .then(() => configureProject(c, platform))
        .then(() => resolve())
        .catch(e => reject(e));
});

const configureProject = (c, platform) => new Promise((resolve, reject) => {
    logTask(`configureProject:${platform}`);

    const appFolder = getAppFolder(c, platform);

    copyFileSync(path.join(c.globalConfigFolder, 'local.properties'), path.join(appFolder, 'local.properties'));
    mkdirSync(path.join(appFolder, 'app/src/main/assets'));
    fs.writeFileSync(path.join(appFolder, 'app/src/main/assets/index.android.bundle'), '{}');
    fs.chmodSync(path.join(appFolder, 'gradlew'), '755');

    writeCleanFile(path.join(getAppTemplateFolder(c, platform), 'app/build.gradle'),
        path.join(appFolder, 'app/build.gradle'),
        [
            { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
            { pattern: '{{VERSION_CODE}}', override: getAppVersionCode(c, platform) },
            { pattern: '{{VERSION_NAME}}', override: getAppVersion(c, platform) },
        ]);

    const activityPath = 'app/src/main/java/rnv/MainActivity.kt';
    writeCleanFile(path.join(getAppTemplateFolder(c, platform), activityPath),
        path.join(appFolder, activityPath),
        [
            { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
        ]);

    const applicationPath = 'app/src/main/java/rnv/MainApplication.kt';
    writeCleanFile(path.join(getAppTemplateFolder(c, platform), applicationPath),
        path.join(appFolder, applicationPath),
        [
            { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
            { pattern: '{{ENTRY_FILE}}', override: getEntryFile(c, platform) },
        ]);

    const stringsPath = 'app/src/main/res/values/strings.xml';
    writeCleanFile(path.join(getAppTemplateFolder(c, platform), stringsPath),
        path.join(appFolder, stringsPath),
        [
            { pattern: '{{APP_TITLE}}', override: getAppTitle(c, platform) },
        ]);

    let prms = '';
    const permissions = c.appConfigFile.platforms[platform].permissions;
    if (permissions) {
        permissions.forEach((v) => {
            prms += `\n<uses-permission android:name="${v}" />`;
        });
    }

    const manifestFile = 'app/src/main/AndroidManifest.xml';
    writeCleanFile(path.join(getAppTemplateFolder(c, platform), manifestFile),
        path.join(appFolder, manifestFile),
        [
            { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
            { pattern: '{{PERMISIONS}}', override: prms },
        ]);


    resolve();
});

export {
    copyAndroidAssets, configureGradleProject, launchAndroidSimulator,
    listAndroidTargets, packageAndroid, runAndroid, configureAndroidProperties,
};