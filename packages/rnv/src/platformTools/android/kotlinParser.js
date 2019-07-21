import path from 'path';
import os from 'os';
import fs from 'fs';
import net from 'net';
import chalk from 'chalk';
import shell from 'shelljs';
import child_process from 'child_process';
import inquirer from 'inquirer';
import {
    logTask,
    logError,
    getAppFolder,
    isPlatformActive,
    copyBuildsFolder,
    getAppVersion,
    getAppTitle,
    getAppVersionCode,
    writeCleanFile,
    getAppId,
    getAppTemplateFolder,
    getBuildFilePath,
    getEntryFile,
    logWarning,
    logDebug,
    getConfigProp,
    logInfo,
    logSuccess,
    getBuildsFolder,
} from '../../common';
import { copyFolderContentsRecursiveSync, copyFileSync, mkdirSync, readObjectSync } from '../../systemTools/fileutils';
import { getMergedPlugin, parsePlugins } from '../../pluginTools';

export const parseMainApplicationSync = (c, platform) => {
    const appFolder = getAppFolder(c, platform);
    const applicationPath = 'app/src/main/java/rnv/MainApplication.kt';
    writeCleanFile(getBuildFilePath(c, platform, applicationPath), path.join(appFolder, applicationPath), [
        { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
        { pattern: '{{ENTRY_FILE}}', override: getEntryFile(c, platform) },
        { pattern: '{{PLUGIN_IMPORTS}}', override: c.pluginConfig.pluginImports },
        { pattern: '{{PLUGIN_PACKAGES}}', override: c.pluginConfig.pluginPackages },
        { pattern: '{{PLUGIN_METHODS}}', override: c.pluginConfig.mainApplicationMethods },
    ]);
};

export const parseMainActivitySync = (c, platform) => {
    const appFolder = getAppFolder(c, platform);
    const activityPath = 'app/src/main/java/rnv/MainActivity.kt';
    writeCleanFile(getBuildFilePath(c, platform, activityPath), path.join(appFolder, activityPath), [
        { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
        { pattern: '{{PLUGIN_ACTIVITY_IMPORTS}}', override: c.pluginConfig.pluginActivityImports },
        { pattern: '{{PLUGIN_ACTIVITY_METHODS}}', override: c.pluginConfig.pluginActivityMethods },
        { pattern: '{{PLUGIN_ON_CREATE}}', override: c.pluginConfig.pluginActivityCreateMethods },
        { pattern: '{{PLUGIN_ON_ACTIVITY_RESULT}}', override: c.pluginConfig.pluginActivityResultMethods },
    ]);
};

export const parseSplashActivitySync = (c, platform) => {
    const appFolder = getAppFolder(c, platform);
    const splashPath = 'app/src/main/java/rnv/SplashActivity.kt';
    writeCleanFile(getBuildFilePath(c, platform, splashPath), path.join(appFolder, splashPath), [
        { pattern: '{{APPLICATION_ID}}', override: getAppId(c, platform) },
    ]);
};

export const injectPluginKotlinSync = (c, plugin, key, pkg) => {
    const className = pkg ? pkg.split('.').pop() : null;
    let packageParams = '';
    if (plugin.packageParams) {
        packageParams = plugin.packageParams.join(',');
    }

    const pathFixed = plugin.path ? `${plugin.path}` : `node_modules/${key}/android`;
    const modulePath = `../../${pathFixed}`;

    if (plugin.activityImports instanceof Array) {
        plugin.activityImports.forEach((activityImport) => {
            // Avoid duplicate imports
            if (c.pluginConfig.pluginActivityImports.indexOf(activityImport) === -1) {
                c.pluginConfig.pluginActivityImports += `import ${activityImport}\n`;
            }
        });
    }

    if (plugin.activityMethods instanceof Array) {
        c.pluginConfig.pluginActivityMethods += '\n';
        c.pluginConfig.pluginActivityMethods += `${plugin.activityMethods.join('\n    ')}`;
    }

    const mainActivity = plugin.mainActivity;
    if (mainActivity) {
        if (mainActivity.createMethods instanceof Array) {
            c.pluginConfig.pluginActivityCreateMethods += '\n';
            c.pluginConfig.pluginActivityCreateMethods += `${mainActivity.createMethods.join('\n    ')}`;
        }

        if (mainActivity.resultMethods instanceof Array) {
            c.pluginConfig.pluginActivityResultMethods += '\n';
            c.pluginConfig.pluginActivityResultMethods += `${mainActivity.resultMethods.join('\n    ')}`;
        }

        if (mainActivity.imports instanceof Array) {
            mainActivity.imports.forEach((v) => {
                c.pluginConfig.pluginActivityImports += `import ${v}\n`;
            });
        }

        if (mainActivity.methods instanceof Array) {
            c.pluginConfig.pluginActivityMethods += '\n';
            c.pluginConfig.pluginActivityMethods += `${mainActivity.methods.join('\n    ')}`;
        }
    }

    if (pkg) c.pluginConfig.pluginImports += `import ${pkg}\n`;
    if (className) c.pluginConfig.pluginPackages += `${className}(${packageParams}),\n`;

    if (plugin.imports) {
        plugin.imports.forEach((v) => {
            c.pluginConfig.pluginImports += `import ${v}\n`;
        });
    }

    if (plugin.mainApplicationMethods) {
        c.pluginConfig.mainApplicationMethods += `\n${plugin.mainApplicationMethods}\n`;
    }
};