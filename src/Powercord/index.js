const { shell: { openExternal } } = require('electron');
const EventEmitter = require('events');
const { get } = require('powercord/http');
const { sleep } = require('powercord/util');
const Webpack = require('powercord/webpack');
const { WEBSITE } = require('powercord/constants');

const PluginManager = require('./managers/plugins');
const StyleManager = require('./managers/styles');
const APIManager = require('./managers/apis');
const modules = require('./modules');

module.exports = class Powercord extends EventEmitter {
  constructor () {
    super();

    this.api = {};
    this.initialized = false;
    this.styleManager = new StyleManager();
    this.pluginManager = new PluginManager();
    this.apiManager = new APIManager();
    this.account = null;
    this.isLinking = false;
    this.patchWebSocket();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  // Powercord initialization
  async init () {
    // Webpack
    await Webpack.init();

    // Modules
    await Promise.all(modules.map(mdl => mdl()));
    const isOverlay = (/overlay/).test(location.pathname);

    // In Discord client I have usually 21 entries in it. In the overlay I usually have 18 entries
    while (window.webpackJsonp.length < (isOverlay ? 18 : 21)) {
      await sleep(1);
    }

    await this.startup();
    this.fetchAccount();

    const SentryModule = await require('powercord/webpack').getModule([ '_originalConsoleMethods', '_wrappedBuiltIns' ]);
    const buildId = SentryModule._globalOptions.release;
    const gitInfos = await this.pluginManager.get('pc-updater').getGitInfos();
    this.buildInfo = `Release Channel: ${window.GLOBAL_ENV.RELEASE_CHANNEL} - Discord's Build Number: ${buildId} - Powercord's git revision: ${gitInfos.revision}@${gitInfos.branch}`;

    // Token manipulation stuff
    if (this.settings.get('hideToken', true)) {
      const tokenModule = await require('powercord/webpack').getModule([ 'hideToken' ]);
      tokenModule.hideToken = () => void 0;
    }

    this.emit('loaded');
  }

  // Powercord startup
  async startup () {
    // APIs
    await this.apiManager.startAPIs();
    this.settings = powercord.api.settings.buildCategoryObject('pc-general');

    // Style Manager
    this.styleManager.loadThemes();

    // Plugins
    await this.pluginManager.startPlugins();

    this.initialized = true;
  }

  // Powercord shutdown
  async shutdown () {
    this.initialized = false;
    // Plugins
    await this.pluginManager.shutdownPlugins();

    // Style Manager
    this.styleManager.unloadThemes();

    // APIs
    await this.apiManager.unload();
  }

  // Bad code
  patchWebSocket () {
    const _this = this;

    window.WebSocket = class PatchedWebSocket extends window.WebSocket {
      constructor (url) {
        super(url);

        this.addEventListener('message', (data) => {
          _this.emit(`webSocketMessage:${data.origin.slice(6)}`, data);
        });
      }
    };
  }

  async fetchAccount () {
    if (this.isLinking) {
      while (this.isLinking) {
        await sleep(1);
      }
      return;
    }

    this.isLinking = true;
    const token = this.settings.get('powercordToken', null);
    if (token) {
      const baseUrl = this.settings.get('backendURL', WEBSITE);
      console.debug('%c[Powercord]', 'color: #257dd4', 'Logging in to your account...');

      const resp = await get(`${baseUrl}/api/users/@me`)
        .set('Authorization', token)
        .catch(e => e);

      if (resp.statusCode === 401) {
        if (!resp.body.error && resp.body.error !== 'DISCORD_REVOKED') {
          const announcements = powercord.pluginManager.get('pc-announcements');
          if (announcements) {
            // even if the plugin is not ready yet, we can perform actions
            announcements.sendNotice({
              id: 'pc-account-discord-unlinked',
              type: announcements.Notice.TYPES.RED,
              message: 'Your Powercord account is no longer linked to your Discord account! Some integration will be disabled.',
              button: {
                text: 'Link it back',
                onClick: () => {
                  announcements.closeNotice('pc-account-discord-unlinked');
                  openExternal(`${WEBSITE}/oauth/discord`);
                }
              },
              alwaysDisplay: true
            });
          }

          this.isLinking = false;
          return; // keep token stored
        }
        this.settings.set('powercordToken', null);
        this.account = null;
        this.isLinking = false;
        return console.error('%c[Powercord]', 'color: #257dd4', 'Unable to fetch your account (Invalid token). Removed token from config');
      } else if (resp.statusCode !== 200) {
        this.account = null;
        this.isLinking = false;
        return console.error('%c[Powercord]', 'color: #257dd4', `An error occurred while fetching your account: ${resp.statusCode} - ${resp.statusText}`, resp.body);
      }

      this.account = resp.body;
      this.account.token = token;
    } else {
      this.account = null;
    }
    console.debug('%c[Powercord]', 'color: #257dd4', 'Logged in!');
    this.isLinking = false;
  }
};
