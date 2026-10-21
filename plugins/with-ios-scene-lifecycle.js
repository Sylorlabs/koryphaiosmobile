const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const APP_DELEGATE_CLASS = 'class AppDelegate: ExpoAppDelegate {';
const APP_DELEGATE_PROVIDER_CLASS =
  'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';

const LEGACY_START_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

const TVOS_START_BLOCK = `#if os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return config;
  });

  config = withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('Koryphaios mobile expects Expo to generate a Swift AppDelegate.');
    }

    let contents = config.modResults.contents;
    if (!contents.includes(APP_DELEGATE_PROVIDER_CLASS)) {
      if (!contents.includes(APP_DELEGATE_CLASS)) {
        throw new Error('Could not locate the Expo AppDelegate declaration.');
      }
      contents = contents.replace(APP_DELEGATE_CLASS, APP_DELEGATE_PROVIDER_CLASS);
    }

    if (contents.includes(LEGACY_START_BLOCK)) {
      contents = contents.replace(LEGACY_START_BLOCK, TVOS_START_BLOCK);
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
}

module.exports = withIosSceneLifecycle;
