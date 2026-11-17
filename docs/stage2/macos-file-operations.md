# Этап 2: файловые операции и macOS-аудит

База: `4f647fd978f477b546de07ddfc18412d86bc6cff`, ветка `fix/catalina-startup-diagnostics`. Изменения этапа 2 находятся в отдельной `fix/catalina-file-operations`; целевая ветка нового Draft PR — `fix/catalina-startup-diagnostics`, не main. PR #1 напрямую не изменяется.

## Диагноз до исправлений

| Наблюдение | Подтверждено в исходниках/тесте | Что ещё неизвестно |
| --- | --- | --- |
| Диалог создания закрывается без папки | CreateFileButton ожидает Promise, но FileSystemProvider ловит исключение create_directory, записывает его в state и возвращает fulfilled undefined. Диалог трактует это как успех. Аналогичная ошибка есть у создания файла. SFTP false и loadDirectory false также не превращались в ошибку | Какая именно native ошибка возникала в Downloads на iMac: права, имя, отсутствующий путь или другое. Full Disk Access не требуется без доказательства |
| Invalid date | Rust format_system_time выдавал UTC `YYYY-MM-DD HH:mm:ss` без зоны. new Date использовал неунифицированный, не-ISO парсинг; Safari может его отвергнуть. Сортировка использовала тот же путь. | Фактические значения каждого проблемного каталога; неизвестное время не должно превращаться в придуманную дату |
| Projects как шаблон | Path::exists проверял относительный путь относительно cwd процесса; API-документация уже обещала абсолютный путь, UI это не объяснял | Существовал ли Projects в cwd того запуска. Сообщение не доказывает дефект файловой системы |
| Плохое отображение | В theme.css невалидная конструкция `:root.reduce-motion, @media ...`; сборка предупреждала о CSS syntax. Modal footer использовал flex gap, отсутствующий в Safari 13 | Нет актуального скриншота iMac для пиксельного сравнения. Поддержка CSS не тождественна фактической версии WebKit на этом Mac |

Дополнительный подтверждённый дефект: альтернативные utility createFile/createDirectory посылали snake_case аргументы (и directory_name вместо folder_name), в то время как Tauri-команды ожидают camelCase IPC. Исправлен тот же контракт; текущий основной provider уже использовал правильные ключи.

## Исправления и файлы

- `src/providers/FileSystemProvider.jsx`: propagate creation errors; remote false is failure; check reload result; return explicit true only after successful create and refresh. If creation succeeded but refresh failed, the error says so and advises refresh before retrying.
- `src/components/explorer/CreateFileButton.jsx`: capture destination when opening; retain name/context and inline readable error on failure; close only on true; block duplicate submission and closing while pending. No false success notification or permission request. Existing native confirm/alert error branch is replaced by inline errors without automatic name changes.
- `src/utils/operationError.js`, `fileOperations.js`: unwrap Rust JSON custom_message and correct IPC keys in alternate utility entry points.
- `src-tauri/src/models/directory_entries_helper.rs`: new timestamps use RFC3339 UTC with Z. `src/utils/formatters.js` accepts new ISO, old UTC format, date-only ISO, Date and millisecond timestamps; validates calendar fields and displays Unknown for invalid/missing values. `FileList.jsx` uses the same parser for sorting.
- `src-tauri/src/commands/template_commands.rs`: reject relative paths **before** copy/registration, with guidance and macOS/Windows examples. Absolute paths keep existing copy behavior. `TemplateList.jsx` explains the absolute-path contract and shows a macOS example; invalid paths are never silently saved.
- `src/styles/theme.css`, `src/components/common/common.css`: valid reduced-motion blocks and equivalent sibling margins instead of flex gap in the modal footer. No redesign of table, layout or palette.
- `tests/fileDates.test.js`, Rust regression modules and `tests/browser/fileCreation.browser.jsx`: date formats, actual filesystem creation/failure, template relative/absolute paths, real React dialog/provider/list behavior.
- `scripts/test-file-creation-browser.js`, `.github/workflows/test-only.yml`: browser regression test using preinstalled Chromium/Chrome, no new dependency. Pull-request branch glob changed to ** so the new PR targeting a branch with / can run checks.

## Оригинальная macOS-поддержка

Все три названных коммита являются предками `4f647fd` (проверено git merge-base --is-ancestor):

| Коммит | Реальные изменения | Применение в нашей ветке |
| --- | --- | --- |
| `93b2f63` supposed mac os fail to open window fix | Построение universal/DMG, launch-wrapper в post-build, документация, имя/идентификатор Explr, Info.plist/signing-настройки; не CSS и не создание папок | Исходники скриптов и конфигурация уже есть. Wrapper не запускается обычной cargo tauri build автоматически |
| `a538345` mac stuff | Удаление .DS_Store и изменение gitignore | Уже присутствует, runtime-исправлений нет |
| `d85969e` comit from mac | Обновления frontend tooling/lock-файлов, generated macOS schema и тривиальный assert!(true) тест main | Исторически входит; дальнейшие изменения заменили часть кода/locks. Не является доказанным исправлением окна/прав/дизайна |

`package.json` специальные macOS build-скрипты и `build-universal.sh` вызывают post-build отдельно. Обычная целевая команда пользователя `cargo tauri build --target x86_64-apple-darwin --bundles app -- --locked` использует beforeBuildCommand (Vite), но не этот post-build.

Post-build переименовывает native бинарник в src-tauri-real, создаёт shell-wrapper с TERM/PATH/XPC и подставным __CFBundleIdentifier=com.apple.Terminal, меняет cwd на Contents/MacOS, правит Info.plist и выполняет ad-hoc codesign --force --deep --sign -, затем создаёт DMG. Это упаковка/окружение/подпись, не WebKit/CSS fix и не разрешение файлового доступа. PATH содержит пути новых macOS, которых нет на Catalina; архитектура по умолчанию aarch64. Специальная Intel npm-команда не задаёт CARGO_CFG_TARGET_ARCH для отдельного post-build, поэтому его default-path может оказаться неверным. Скрипт не переносится и не исполняется в рамках исправления. Нельзя считать подстановку Terminal выдачей TCC-разрешений.

Конфигурация указывает `entitlements: src-tauri/entitlements.plist`, но такой файл в checkout отсутствует; включение app sandbox из этого не следует. Фактические entitlements/подпись собранной .app нужно отдельно посмотреть на iMac: `codesign -d --entitlements :- /полный/путь/Explr.app` и `codesign -dv --verbose=4 /полный/путь/Explr.app`. Никаких прав или security-настроек этим PR не добавляется.

`minimumSystemVersion: 10.13` — декларация упаковки, не проверка API. Нет доказательства работоспособности всего приложения на штатной 10.13: там исходно Safari 11, а наш syntax target — Safari 13; изначальный debug protocol panic тоже демонстрирует необходимость проверок runtime availability. Нельзя честно заявить универсальную подтверждённую поддержку «10.13+». Не повышаем/понижаем minimumSystemVersion по предположению: сохраняем декларацию и фиксируем ограничение. Для Catalina имеется пользовательское подтверждение интерфейса/навигации в 4f647fd, но новые исправления этапа 2 ещё не проверены на устройстве.

## Аудит вида

Визуально изучен `assets/screenshot_details.png`: это уже исходный интерфейс с sidebar, четырьмя колонками Name/Size/Type/Modified и правой панелью Properties. Текущий CSS задаёт для Size/Type/Modified те же явные ширины 100/120/150px, Name — flex/min-width 200px. Дизайн и базовая плотность не являются сами по себе багом Catalina. При узком окне суммарная минимальная ширина может ограничить видимые колонки — нужна проверка конкретного размера, не переработка таблицы вслепую.

Safari 13 поддерживает используемые grid, CSS variables, flex и prefixed backdrop-filter, но не flex-gap и color-mix. У danger-button color-mix задаёт только hover поверх базового цвета; отсутствие этого эффекта не объясняет общую поломку интерфейса. Прочие flex-gap места остаются кандидатами для конкретного скриншота, не вводится глобальный неподтверждённый CSS polyfill. Найденные неверный @media и отступы footer исправлены. Новых CSS-syntax предупреждений после исправления нет; смешанные static/dynamic import warnings Vite остаются.

## Проверки и пределы

- `node --test tests/*.test.js`: 14 passed.
- `node scripts/test-file-creation-browser.js`: PASS для отказа, сохранения name/context/modal, успешного refresh, двойного нажатия и отдельного сбоя refresh. Реальные React, FileSystemProvider и DOM Chromium; IPC, settings/history и SFTP boundaries имитируются. Это не реальный Tauri/WebKit.
- `node scripts/test-file-creation-browser.js --baseline`: ожидаемо FAIL на исходных CreateFileButton/FileSystemProvider из 4f647fd: диалог исчезает после отказа, inline ошибка не появляется. Исходники рабочего checkout для этого не откатываются.
- Rust directory_creation_regressions: 2 passed (реальный каталог, listing, duplicate и файл вместо parent); source_path_regressions: 1 passed; timestamp_contract_tests: 1 passed. Existing template suite: 12 passed, включая абсолютные source paths, missing source и copy.
- `npm run build`, `node scripts/check-frontend-build.js`, `npm run check:tauri`, `cargo build --locked`: проверяются на Linux. Dependencies/lock-файлы не меняются.
- Полный Rust-набор: **245 passed / 1 failed / 0 ignored**, exit 101. Падает прежний state::searchengine_data::bench_indexing_methods::test_concurrent_search_optimization (`Engine is currently searching`), как уже фиксировалось на исходной базе при onboarding. Файл поиска не меняется; этот результат не объявляется зелёным после повторов. GitHub CI нужно читать для текущего коммита; результаты предыдущих запусков не заменяют их. Нет macOS/WebKit13 runtime в этой среде. TCC и визуальная точность требуют реального iMac.

## Короткая проверка на iMac

1. Выбрать ветку `fix/catalina-file-operations`, сохранить SHA, sw_vers и uname -m. `npm ci; npm run build; cargo tauri build --target x86_64-apple-darwin --bundles app -- --locked`. Не выполнять post-build wrapper. Запустить именно новую .app.
2. В Downloads создать уникальную папку кнопкой Create и отдельно Enter. Убедиться в её наличии в Explr и Finder (`test -d "$HOME/Downloads/имя"`). Повторить существующее имя: диалог остаётся, имя/каталог сохранены, виден понятный текст. Двойное нажатие не должно вызывать две операции. Отказ прав воспроизводить только в заранее известном недоступном тестовом каталоге, без изменения системных прав и без Full Disk Access. Сохранить показанный native error, если Downloads всё ещё не создаётся.
3. Проверить Modified для файлов/каталогов, сравнить с Finder и сортировкой вверх/вниз. Новые метаданные идут с Z; отображение локальное. Неизвестные даты — Unknown, не Invalid date.
4. В шаблонах ввести Projects: получить объяснение абсолютного пути; убедиться, что шаблон не добавлен. Ввести реальный абсолютный путь к маленькому тестовому файлу/каталогу: шаблон копируется; несуществующий абсолютный путь должен дать Source path does not exist. Проверить сохранность исходника и повторное использование.
5. Сравнить окно/таблицу при ширине 1200px и меньшей, кнопки modal, ошибки и закрытие; сделать скриншоты с указанием масштаба/темы и версии WebKit. Проверить reduced motion. Проверить запуск через Finder и из другого cwd.

Не выполнять merge до ручной проверки. Успешные Linux-тесты не означают, что исправления подтверждены на Catalina.
