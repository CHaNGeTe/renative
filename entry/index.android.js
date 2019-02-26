import { AppRegistry, Platform } from 'react-native';
import App from '../src/app';
import Api from '../src/api';

const { isTV } = Platform;

Api.platform = isTV ? 'androidtv' : 'android';

AppRegistry.registerComponent('App', () => App);