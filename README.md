# Поток — CRM исполнения и прибыли

**Potok — Execution & Profit CRM**

Интерактивный двуязычный прототип CRM для digital-/creative-агентств и проектных B2B-команд. Он связывает предложения, договоры, исполнение, документы, платежи и маржу в единый процесс.

An interactive bilingual CRM prototype for digital/creative agencies and project-based B2B teams. It connects proposals, contracts, delivery, documents, payments, and margin in a single workflow.

> Это демонстрационный прототип, а не готовая к production CRM. Интеграции, платежи, подписания и ИИ-функции имитируются локально.

## Русский

### Возможности

- Сквозной сценарий от предложения и договора до проекта, акта, счёта и оплаты.
- Плановые и фактические затраты, расчёт маржи и отклонений, контроль дебиторской задолженности.
- Интерактивные KPI-карточки с определениями метрик и источниками расчёта.
- Роли собственника, продаж, исполнителя, финансов и внешнего клиента с разным уровнем доступа к данным.
- Клиентский портал с материалами, согласованиями, запросами изменений и вопросами.
- Демонстрационный перенос данных из CSV с сопоставлением полей, поиском дубликатов, проверкой качества и откатом.
- Переключение между русским и английским языками без потери текущего маршрута и введённых данных.
- Сохранение изменений локально в браузере без backend и учётных данных.

Все суммы в демонстрации указаны в RUB; конвертация валют не поддерживается.

### Запуск

Рекомендуемые версии: Node.js 24 и npm 12. Также можно использовать другую среду, совместимую с Angular 22.

```bash
npm ci
npm start
```

Откройте `http://localhost:4200`. Ручная инициализация и настройка переменных окружения не требуются.

### Демонстрационные сценарии

Пошаговые сценарии на 5–7 минут:

- [Демонстрация на русском](docs/demo-ru.md)
- [English demo](docs/demo-en.md)
- [Глоссарий RU/EN](docs/glossary.md)

### Хранение данных

Демонстрационные данные и пользовательские изменения сохраняются в `localStorage` браузера. Данные не отправляются на сервер. Сбросить их можно кнопкой **Сбросить демо-данные** на странице **Контроль исполнения и прибыли**.

Не вводите в демонстрационную версию реальные персональные данные, коммерческую тайну или иную конфиденциальную информацию.

### Ограничения прототипа

- Банк, импорт оплат, учётная система, ЭДО, почта, календарь и файловое хранилище не подключены.
- Подписание и оплата являются локальной имитацией: юридически значимая подпись не создаётся, реальные деньги не перемещаются.
- ИИ-объяснения и рекомендации формируются детерминированными правилами; внешняя модель не используется.
- HubSpot и Pipedrive показаны только как демонстрационные источники миграции, а не как подключённые API.
- ERP, бухгалтерский учёт, revenue recognition, полноценный compliance/ЭДО и автоматический перевод пользовательского ввода не реализованы.

### Проверки

```bash
npm run build                 # production-сборка и строгие Angular/TypeScript template checks
npm test -- --watch=false     # unit, workflow, role и двуязычные route smoke tests
npm run test:e2e              # Chrome/Edge: layout и полный сценарий RU/EN
npm run format:check          # Prettier
npm run check                 # format + build + unit tests
```

`test:e2e` автоматически запускает dev-server, если он не запущен, и находит Chrome или Edge. При нестандартном расположении браузера задайте `CHROME_PATH`. Команда `npm run test:e2e -- --artifacts` дополнительно сохраняет скриншоты в `tmp/browser-check`.

### Технологии

Angular 22, TypeScript, RxJS, SCSS, Vitest и Prettier.

---

## English

> This is a demonstration prototype, not a production-ready CRM. Integrations, payments, signatures, and AI features are simulated locally.

### Features

- An end-to-end workflow from proposal and contract to project, acceptance certificate, invoice, and payment.
- Planned and actual costs, margin and variance calculations, and accounts-receivable tracking.
- Interactive KPI cards with metric definitions and calculation sources.
- Owner, sales, delivery, finance, and external-client roles with different data visibility.
- A client portal for materials, approvals, change requests, and questions.
- Demo CSV migration with field mapping, duplicate detection, quality checks, and rollback.
- Russian/English switching without losing the current route or form input.
- Browser-local persistence with no backend or credentials required.

All demo amounts are in RUB; currency conversion is not supported.

### Getting started

Recommended versions: Node.js 24 and npm 12, or another Angular 22-compatible environment.

```bash
npm ci
npm start
```

Open `http://localhost:4200`. No manual initialization or environment variables are required.

### Demo walkthroughs

- [5–7 minute English demo](docs/demo-en.md)
- [Russian demo](docs/demo-ru.md)
- [RU/EN glossary](docs/glossary.md)

### Data storage

Demo data and user changes are stored in the browser's `localStorage` and are not sent to a server. To reset them, use **Reset demo data** on the **Execution & profit control** page.

Do not enter real personal data, trade secrets, or other confidential information into the demo.

### Prototype limitations

- Banking, payment imports, accounting, EDI, email, calendar, and file storage are not connected.
- Signing and payment are local simulations: no legally binding signature is created and no real money is transferred.
- AI explanations and recommendations use deterministic rules; no external model is called.
- HubSpot and Pipedrive are demo migration sources, not connected APIs.
- ERP, accounting, revenue recognition, full compliance/EDI, and automatic translation of user input are not implemented.

### Verification

```bash
npm run build
npm test -- --watch=false
npm run test:e2e
npm run format:check
npm run check
```

Browser checks start the dev-server when needed and auto-detect Chrome or Edge. Set `CHROME_PATH` if the browser is installed in a non-standard location. Use `npm run test:e2e -- --artifacts` to save screenshots in `tmp/browser-check`.

### Tech stack

Angular 22, TypeScript, RxJS, SCSS, Vitest, and Prettier.
