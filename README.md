# This Fork:

- Changes the installation signature. `attachToInput` has been removed. Just create an instance and optionally pass it an initial language code.

- Removes automatic language detection during typing, which only worked on `<input>` (not contenteditable). To change languages, you must manually invoke `switchLanguage` or give a text example via `provideHintText`. MacOS and Windows/Linux use the same code to determine a language from the hint text and explicitly set the language. *Previously on macOS, this module delegated to NSSpellchecker for automatic language detection, but it was unclear how it worked and many people reported it was broken, so now we use the same detection code on all platforms.*

- When switching languages on MacOS, the misspelling cache is correctly cleared so that previous misspellings are re-evaluated.

- When switching languages on MacOS, the webFrame.setSpellCheckProvider method is re-invoked with the new language code, which allows Chromium to re-run `SpellcheckCharAttribute::CreateRuleSets` and ensure it is breaking words for spellcheck using the appropriate language rules.

- Removes the `shouldAutoCorrect` option (now always `true`) which did not always change immediately when you modified it since the webFrame provider was only created when switching langauges.

- Removes the `Subject` observables.


# electron-spellchecker

![](https://img.shields.io/npm/dm/electron-spellchecker.svg) <a href="https://electron-userland.github.io/electron-spellchecker/docs">![](https://electron-userland.github.io/electron-spellchecker/docs/badge.svg)</a>

electron-spellchecker is a library to help you implement spellchecking in your Electron applications, as well as handle default right-click Context Menus (since spell checking shows up in them).  This library intends to solve the problem of spellchecking in a production-ready, international-friendly way.

electron-spellchecker:

* Spell checks in all of the languages that Google Chrome supports by reusing its dictionaries.
* Automatically detects the language the user is typing in and silently switches on the fly.
* Handles locale correctly and automatically (i.e. users who are from Australia should not be corrected for 'colour', but US English speakers should)
* Automatically downloads and manages dictionaries in the background. 
* Checks very quickly, doesn't introduce input lag which is extremely noticable
* Only loads one Dictionary at a time which saves a significant amount of memory

## Quick Start

```js
import {SpellCheckHandler, ContextMenuListener, ContextMenuBuilder} from 'electron-spellchecker';

window.spellCheckHandler = new SpellCheckHandler();
window.spellCheckHandler.attachToInput();

// Start off as US English, America #1 (lol)
window.spellCheckHandler.switchLanguage('en-US');

let contextMenuBuilder = new ContextMenuBuilder(window.spellCheckHandler);
let contextMenuListener = new ContextMenuListener((info) => {
  contextMenuBuilder.showPopupMenu(info);
});
```

## Language Auto-Detection

The spell checker will attempt to automatically check the language that the user is typing in and switch on-the fly. However, giving it an explicit hint by calling `switchLanguage`, or providing it a block of sample text via `provideHintText` will result in much better results.

Sample text should be text that is reasonably likely to be in the same language as the user typing - for example, in an Email reply box, the original Email text would be a great sample, or in the case of Slack, the existing channel messages are used as the sample text.

## Learning more

* Run `npm start` to start [the example application](https://github.com/electron-userland/electron-spellchecker/tree/master/example) and play around.
* Read [the class documentation](https://electron-userland.github.io/electron-spellchecker/docs/) to learn more.
