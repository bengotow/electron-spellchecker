'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _spawnRx = require('spawn-rx');

var _electronRemote = require('electron-remote');

var _lruCache = require('lru-cache');

var _lruCache2 = _interopRequireDefault(_lruCache);

var _Observable = require('rxjs/Observable');

require('rxjs/add/observable/defer');

require('rxjs/add/observable/empty');

require('rxjs/add/observable/fromEvent');

require('rxjs/add/observable/fromPromise');

require('rxjs/add/observable/of');

require('rxjs/add/operator/catch');

require('rxjs/add/operator/concat');

require('rxjs/add/operator/concatMap');

require('rxjs/add/operator/do');

require('rxjs/add/operator/filter');

require('rxjs/add/operator/mergeMap');

require('rxjs/add/operator/merge');

require('rxjs/add/operator/observeOn');

require('rxjs/add/operator/reduce');

require('rxjs/add/operator/startWith');

require('rxjs/add/operator/take');

require('rxjs/add/operator/takeUntil');

require('rxjs/add/operator/throttle');

require('rxjs/add/operator/toPromise');

require('./custom-operators');

var _dictionarySync = require('./dictionary-sync');

var _dictionarySync2 = _interopRequireDefault(_dictionarySync);

var _utility = require('./utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

let Spellchecker;

let d = require('debug')('electron-spellchecker:spell-check-handler');

const cld = (0, _electronRemote.requireTaskPool)(require.resolve('./cld2'));
let fallbackLocaleTable = null;
let webFrame = process.type === 'renderer' ? require('electron').webFrame : null;

// NB: Linux and Windows uses underscore in languages (i.e. 'en_US'), whereas
// we're trying really hard to match the Chromium way of `en-US`
const validLangCodeWindowsLinux = /[a-z]{2}[_][A-Z]{2}/;

const isMac = process.platform === 'darwin';

const shouldAutoCorrect = true;

// NB: This is to work around electron/electron#1005, where contractions
// are incorrectly marked as spelling errors. This lets people get away with
// incorrectly spelled contracted words, but it's the best we can do for now.
const contractions = ["ain't", "aren't", "can't", "could've", "couldn't", "couldn't've", "didn't", "doesn't", "don't", "hadn't", "hadn't've", "hasn't", "haven't", "he'd", "he'd've", "he'll", "he's", "how'd", "how'll", "how's", "I'd", "I'd've", "I'll", "I'm", "I've", "isn't", "it'd", "it'd've", "it'll", "it's", "let's", "ma'am", "mightn't", "mightn't've", "might've", "mustn't", "must've", "needn't", "not've", "o'clock", "shan't", "she'd", "she'd've", "she'll", "she's", "should've", "shouldn't", "shouldn't've", "that'll", "that's", "there'd", "there'd've", "there're", "there's", "they'd", "they'd've", "they'll", "they're", "they've", "wasn't", "we'd", "we'd've", "we'll", "we're", "we've", "weren't", "what'll", "what're", "what's", "what've", "when's", "where'd", "where's", "where've", "who'd", "who'll", "who're", "who's", "who've", "why'll", "why're", "why's", "won't", "would've", "wouldn't", "wouldn't've", "y'all", "y'all'd've", "you'd", "you'd've", "you'll", "you're", "you've"];

const contractionMap = contractions.reduce((acc, word) => {
  acc[word.replace(/'.*/, '')] = true;
  return acc;
}, {});

const alternatesTable = {};

/**
 * SpellCheckHandler is the main class of this library, and handles all of the
 * different pieces of spell checking except for the context menu information.
 *
 * Instantiate the class, then call {{attachToInput}} to wire it up. The spell
 * checker will attempt to automatically check the language that the user is
 * typing in and switch on-the fly. However, giving it an explicit hint by
 * calling {{switchLanguage}}, or providing it a block of sample text via
 * {{provideHintText}} will result in much better results.
 *
 * Sample text should be text that is reasonably likely to be in the same language
 * as the user typing - for example, in an Email reply box, the original Email text
 * would be a great sample, or in the case of Slack, the existing channel messages
 * are used as the sample text.
 */
class SpellCheckHandler {
  /**
   * Constructs a SpellCheckHandler
   *
   * @param  {DictionarySync} dictionarySync  An instance of {{DictionarySync}},
   *                                          create a custom one if you want
   *                                          to override the dictionary cache
   *                                          location.
   * @param  {LocalStorage} localStorage      Deprecated.
   */
  constructor() {
    let initialLanguage = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'en-US';
    let dictionarySync = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    // NB: Require here so that consumers can handle native module exceptions.
    Spellchecker = require('./node-spellchecker').Spellchecker;

    this.dictionarySync = dictionarySync || new _dictionarySync2.default();
    this.currentSpellchecker = null;
    this.currentSpellcheckerLanguage = null;
    this.isMisspelledCache = new _lruCache2.default({
      max: 512, maxAge: 4 * 1000
    });

    this.switchLanguage(initialLanguage);
  }

  /**
   * Override the default logger for this class. You probably want to use
   * {{setGlobalLogger}} instead
   *
   * @param {Function} fn   The function which will operate like console.log
   */
  static setLogger(fn) {
    d = fn;
  }

  /**
   * Switch the dictionary language to the language of the sample text provided.
   * As described in the class documentation, call this method with text most
   * likely in the same language as the user is typing. The locale (i.e. *US* vs
   * *UK* vs *AU*) will be inferred heuristically based on the user's computer.
   *
   * @param  {String} inputText   A language code (i.e. 'en-US')
   *
   * @return {Promise}            Completion
   */
  provideHintText(inputText) {
    var _this = this;

    return _asyncToGenerator(function* () {
      let langWithoutLocale = null;

      try {
        langWithoutLocale = yield _this.detectLanguageForText(inputText.substring(0, 512));
      } catch (e) {
        d(`Couldn't detect language for text of length '${inputText.length}': ${e.message}, ignoring sample`);
        return;
      }

      let lang = yield _this.getLikelyLocaleForLanguage(langWithoutLocale);
      if (lang) {
        yield _this.switchLanguage(lang);
      }
    })();
  }

  /**
   * Explicitly switch the language to a specific language. This method will
   * automatically download the dictionary for the specific language and locale
   * and on failure, will attempt to switch to dictionaries that are the same
   * language but a default locale.
   *
   * @param  {String} langCode    A language code (i.e. 'en-US')
   *
   * @return {Promise}            Completion
   */
  switchLanguage(langCode) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      let actualLang;
      let dict = null;

      if (isMac) {
        actualLang = langCode;
      } else {
        // Fetch dictionary on Linux & Windows (Hunspell)
        try {
          var _ref = yield _this2.loadDictionaryForLanguageWithAlternatives(langCode);

          const dictionary = _ref.dictionary,
                language = _ref.language;

          actualLang = language;dict = dictionary;
        } catch (e) {
          d(`Failed to load dictionary ${langCode}: ${e.message}`);
          throw e;
        }

        if (!dict) {
          d(`dictionary for ${langCode}_${actualLang} is not available`);
          _this2.currentSpellcheckerLanguage = actualLang;
          _this2.currentSpellchecker = null;
          return;
        }
      }

      d(`Setting current spellchecker to ${actualLang}, requested language was ${langCode}`);
      if (_this2.currentSpellcheckerLanguage !== actualLang || !_this2.currentSpellchecker) {
        _this2.isMisspelledCache.reset();

        d(`Creating node-spellchecker instance`);

        // Note: On macOS we can re-use the spellchecker
        if (!_this2.currentSpellchecker || !isMac) {
          _this2.currentSpellchecker = new Spellchecker();
        }
        if (isMac) {
          _this2.currentSpellchecker.setDictionary(actualLang);
        } else {
          _this2.currentSpellchecker.setDictionary(actualLang, dict);
        }
        _this2.currentSpellcheckerLanguage = actualLang;

        // Note: It's important we update the webframe provider, even with the same callback, because
        // the langauge is used to determine which characters break words. It's passed all the way to
        // https://github.com/adobe/chromium/blob/master/chrome/renderer/spellchecker/spellcheck_worditerator.cc
        if (webFrame) {
          webFrame.setSpellCheckProvider(_this2.currentSpellcheckerLanguage, shouldAutoCorrect, { spellCheck: _this2.handleElectronSpellCheck.bind(_this2) });
        }
      }
    })();
  }

  /**
   * Loads a dictionary and attempts to use fallbacks if it fails.
   * @private
   */
  loadDictionaryForLanguageWithAlternatives(langCode) {
    var _this3 = this;

    let cacheOnly = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    return _asyncToGenerator(function* () {
      _this3.fallbackLocaleTable = _this3.fallbackLocaleTable || require('./fallback-locales');
      let lang = langCode.split(/[-_]/)[0];

      let alternatives = [langCode, yield _this3.getLikelyLocaleForLanguage(lang), _this3.fallbackLocaleTable[lang]];
      if (langCode in alternatesTable) {
        try {
          return {
            language: alternatesTable[langCode],
            dictionary: yield _this3.dictionarySync.loadDictionaryForLanguage(alternatesTable[langCode])
          };
        } catch (e) {
          d(`Failed to load language ${langCode}, altTable=${alternatesTable[langCode]}`);
          delete alternatesTable[langCode];
        }
      }

      d(`Requesting to load ${langCode}, alternatives are ${JSON.stringify(alternatives)}`);
      return yield _Observable.Observable.of(...alternatives).concatMap(function (l) {
        return _Observable.Observable.defer(function () {
          return _Observable.Observable.fromPromise(_this3.dictionarySync.loadDictionaryForLanguage(l, cacheOnly));
        }).map(function (d) {
          return { language: l, dictionary: d };
        }).do(function (_ref2) {
          let language = _ref2.language;

          alternatesTable[langCode] = language;
        }).catch(function () {
          return _Observable.Observable.of(null);
        });
      }).concat(_Observable.Observable.of({ language: langCode, dictionary: null })).filter(function (x) {
        return x !== null;
      }).take(1).toPromise();
    })();
  }

  /**
   *  The actual callout called by Electron to handle spellchecking
   *  @private
   */
  handleElectronSpellCheck(text) {
    if (!this.currentSpellchecker) return true;

    let result = this.isMisspelled(text);
    return !result;
  }

  /**
   * Calculates whether a word is missspelled, using an LRU cache to memoize
   * the callout to the actual spell check code.
   *
   * @private
   */
  isMisspelled(text) {
    let result = this.isMisspelledCache.get(text);
    if (result !== undefined) {
      return result;
    }

    result = (() => {
      if (contractionMap[text.toLocaleLowerCase()]) {
        return false;
      }

      if (!this.currentSpellchecker) return false;

      if (isMac) {
        return this.currentSpellchecker.isMisspelled(text);
      }

      // NB: I'm not smart enough to fix this bug in Chromium's version of
      // Hunspell so I'm going to fix it here instead. Chromium Hunspell for
      // whatever reason marks the first word in a sentence as mispelled if it is
      // capitalized.
      result = this.currentSpellchecker.checkSpelling(text);
      if (result.length < 1) {
        return false;
      }

      if (result[0].start !== 0) {
        // If we're not at the beginning, we know it's not a false positive
        return true;
      }

      // Retry with lowercase
      return this.currentSpellchecker.isMisspelled(text.toLocaleLowerCase());
    })();

    this.isMisspelledCache.set(text, result);
    return result;
  }

  /**
   * Calls out to cld2 to detect the language of the given text
   * @private
   */
  detectLanguageForText(text) {
    return new Promise((res, rej) => {
      setTimeout(() => cld.detect(text).then(res, rej), 10);
    });
  }

  /**
   * Returns the locale for a language code based on the user's machine (i.e.
   * 'en' => 'en-GB')
   */
  getLikelyLocaleForLanguage(language) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      let lang = language.toLowerCase();
      if (!_this4.likelyLocaleTable) _this4.likelyLocaleTable = yield _this4.buildLikelyLocaleTable();

      if (_this4.likelyLocaleTable[lang]) return _this4.likelyLocaleTable[lang];
      _this4.fallbackLocaleTable = _this4.fallbackLocaleTable || require('./fallback-locales');

      return _this4.fallbackLocaleTable[lang];
    })();
  }

  /**
   * A proxy for the current spellchecker's method of the same name
   * @private
   */
  getCorrectionsForMisspelling(text) {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      // NB: This is async even though we don't use await, to make it easy for
      // ContextMenuBuilder to use this method even when it's hosted in another
      // renderer process via electron-remote.
      if (!_this5.currentSpellchecker) {
        return null;
      }

      return _this5.currentSpellchecker.getCorrectionsForMisspelling(text);
    })();
  }

  /**
   * A proxy for the current spellchecker's method of the same name
   * @private
   */
  addToDictionary(text) {
    var _this6 = this;

    return _asyncToGenerator(function* () {
      // NB: Same deal as getCorrectionsForMisspelling.
      if (!isMac) return;
      if (!_this6.currentSpellchecker) return;

      _this6.currentSpellchecker.add(text);
    })();
  }

  /**
   * Call out to the OS to figure out what locales the user is probably
   * interested in then save it off as a table.
   * @private
   */
  buildLikelyLocaleTable() {
    var _this7 = this;

    return _asyncToGenerator(function* () {
      let localeList = [];

      if (process.platform === 'linux') {
        let locales = yield (0, _spawnRx.spawn)('locale', ['-a']).catch(function () {
          return _Observable.Observable.of(null);
        }).reduce(function (acc, x) {
          acc.push(...x.split('\n'));return acc;
        }, []).toPromise();

        d(`Raw Locale list: ${JSON.stringify(locales)}`);

        localeList = locales.reduce(function (acc, x) {
          let m = x.match(validLangCodeWindowsLinux);
          if (!m) return acc;

          acc.push(m[0]);
          return acc;
        }, []);
      }

      if (process.platform === 'win32') {
        localeList = require('keyboard-layout').getInstalledKeyboardLanguages();
      }

      if (isMac) {
        fallbackLocaleTable = fallbackLocaleTable || require('./fallback-locales');

        // NB: OS X will return lists that are half just a language, half
        // language + locale, like ['en', 'pt_BR', 'ko']. If the user has
        // custom dictionaries installed, it cana also return random weird
        // strings like `ars` (Najdi Arabic) we have no idea what to do with
        // and just ignore.
        localeList = _this7.currentSpellchecker.getAvailableDictionaries().map(function (x) {
          if (x.length === 2) return fallbackLocaleTable[x];
          return (0, _utility.normalizeLanguageCode)(x); // BG: can return null
        }).filter(function (lang) {
          return !!lang;
        });
      }

      d(`Filtered Locale list: ${JSON.stringify(localeList)}`);

      // Some distros like Ubuntu make locale -a useless by dumping
      // every possible locale for the language into the list :-/
      let counts = localeList.reduce(function (acc, x) {
        let k = x.split(/[-_\.]/)[0];
        acc[k] = acc[k] || [];
        acc[k].push(x);

        return acc;
      }, {});

      d(`Counts: ${JSON.stringify(counts)}`);

      let ret = Object.keys(counts).reduce(function (acc, x) {
        if (counts[x].length > 1) return acc;

        d(`Setting ${x}`);
        acc[x] = (0, _utility.normalizeLanguageCode)(counts[x][0]);
        if (!acc[x]) {
          throw new Error(`${counts[x][0]} is not a valid language code`);
        }
        return acc;
      }, {});

      // NB: LANG has a Special Place In Our Hearts
      if (process.platform === 'linux' && process.env.LANG) {
        let m = process.env.LANG.match(validLangCodeWindowsLinux);
        if (!m) return ret;

        const key = m[0].split(/[-_\.]/)[0];
        ret[key] = (0, _utility.normalizeLanguageCode)(m[0]);
        if (!ret[key]) {
          throw new Error(`${m[0]} is not a valid language code`);
        }
      }

      d(`Result: ${JSON.stringify(ret)}`);
      return ret;
    })();
  }
}
exports.default = SpellCheckHandler;