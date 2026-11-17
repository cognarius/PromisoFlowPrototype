import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const baseUrl = process.env.POTOK_E2E_URL ?? 'http://127.0.0.1:4200';
const debugPort = Number(process.env.POTOK_CHROME_DEBUG_PORT ?? 9333);
const artifacts = process.argv.includes('--artifacts') ? join(root, 'tmp', 'browser-check') : null;
const profile = join(root, 'tmp', `chrome-profile-${process.pid}`);
let server;
let chrome;
let cdp;
const browserErrors = [];

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function reachable(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitHttp(url, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await reachable(url)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates =
    process.platform === 'win32'
      ? [
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
          'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
          'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
        ]
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
        : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable)
    throw new Error('Chrome was not found. Set CHROME_PATH to a Chrome or Edge executable.');
  return executable;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      this.ws.addEventListener('open', resolvePromise, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePromise, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolvePromise(message.result);
      }
      if (message.method === 'Runtime.exceptionThrown')
        browserErrors.push(message.params.exceptionDetails);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws?.close();
  }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, description, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      if (await evaluate(`Boolean(${expression})`)) return;
    } catch {
      // The page may be navigating; retry until the timeout.
    }
    await sleep(100);
  }
  const content = await evaluate('document.body?.innerText?.slice(0, 2500)').catch(() => '');
  throw new Error(`Timed out: ${description}\n${content}`);
}

async function navigate(path, selector) {
  await cdp.send('Page.navigate', { url: `${baseUrl}${path}` });
  await waitFor(
    `document.readyState === 'complete' && document.querySelector(${JSON.stringify(selector)})`,
    `${path} renders`,
  );
  await evaluate('document.fonts ? document.fonts.ready.then(() => true) : true');
}

async function clickText(text, scope = 'document', exact = false) {
  const expression = `(() => {
    const root = ${scope};
    if (!root) return false;
    const wanted = ${JSON.stringify(text)}.replace(/\\s+/g, ' ').trim().toLowerCase();
    const elements = [...root.querySelectorAll('button, a')];
    const element = elements.find((candidate) => {
      const value = (candidate.innerText || candidate.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return ${exact ? 'value === wanted' : 'value.includes(wanted)'};
    });
    if (!element) return false;
    element.click();
    return true;
  })()`;
  if (!(await evaluate(expression))) throw new Error(`Control not found: ${text} in ${scope}`);
  await sleep(120);
}

async function setInput(selector, value, index = 0, scope = 'document') {
  const changed = await evaluate(`(() => {
    const root = ${scope};
    const element = root ? root.querySelectorAll(${JSON.stringify(selector)})[${index}] : null;
    if (!element) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
    if (setter) setter.call(element, ${JSON.stringify(String(value))});
    else element.value = ${JSON.stringify(String(value))};
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!changed) throw new Error(`Input not found: ${selector}[${index}]`);
  await sleep(80);
}

async function setLanguage(language) {
  await clickText(
    language === 'ru-RU' ? 'RU' : 'EN',
    "document.querySelector('.topbar .language-switch')",
    true,
  );
  await waitFor(
    `document.documentElement.lang === ${JSON.stringify(language)} && localStorage.getItem('potok.language') === ${JSON.stringify(language)}`,
    `language ${language}`,
  );
}

async function screenshot(name) {
  if (!artifacts) return;
  mkdirSync(artifacts, { recursive: true });
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  writeFileSync(join(artifacts, `${name}.png`), Buffer.from(result.data, 'base64'));
}

async function checkPulseDrilldown(label, definition, hrefPrefix, targetSelector) {
  await clickText(label, "document.querySelector('app-pulse')");
  await waitFor(
    `document.querySelector('.source-panel h2')?.textContent.trim() === ${JSON.stringify(label)}`,
    `${label} source panel`,
  );
  const panel = await evaluate(`(() => {
    const element = document.querySelector('.source-panel');
    const link = element?.querySelector('.source-links a');
    return { text: element?.innerText ?? '', href: link?.getAttribute('href') ?? '' };
  })()`);
  if (!panel.text.includes(definition) || !panel.href.includes(hrefPrefix))
    throw new Error(`Incomplete metric drill-down (${label}): ${JSON.stringify(panel)}`);
  await evaluate("document.querySelector('.source-panel .source-links a').click()");
  await waitFor(
    `document.querySelector(${JSON.stringify(targetSelector)}) && document.querySelector('tr.focused')`,
    `${label} source object`,
  );
  console.log(`✓ ${label}: definition, sources, and source-object navigation`);
}

async function assertNoOverflow(label) {
  const layout = await evaluate(`(() => {
    const visibleViewport = window.visualViewport?.width ?? window.innerWidth;
    const overflowing = [...document.body.querySelectorAll('*')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.right > visibleViewport + 1 && !element.closest('.table-wrap');
      })
      .slice(0, 12)
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
      }));
    return {
      viewport: window.innerWidth,
      visibleViewport,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      overflowing,
      missingTranslation: document.body.innerText.includes('Translation unavailable') || document.body.innerText.includes('Перевод недоступен')
    };
  })()`);
  if (
    layout.document > layout.visibleViewport + 1 ||
    layout.body > layout.visibleViewport + 1 ||
    layout.missingTranslation
  ) {
    throw new Error(`Layout check failed (${label}): ${JSON.stringify(layout)}`);
  }
  console.log(`✓ ${label}: ${layout.visibleViewport}px, no page overflow`);
}

async function assertTableFits(label, selector) {
  const layout = await evaluate(`(() => {
    const table = document.querySelector(${JSON.stringify(selector)});
    const wrapper = table?.closest('.table-wrap');
    if (!table || !wrapper) return null;
    const tableRect = table.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    return {
      tableWidth: tableRect.width,
      wrapperWidth: wrapperRect.width,
      tableRight: tableRect.right,
      wrapperRight: wrapperRect.right,
      tableScrollWidth: table.scrollWidth,
      wrapperClientWidth: wrapper.clientWidth,
    };
  })()`);
  if (
    !layout ||
    layout.tableRight > layout.wrapperRight + 1 ||
    layout.tableScrollWidth > layout.wrapperClientWidth + 1
  ) {
    throw new Error(`Table layout check failed (${label}): ${JSON.stringify(layout)}`);
  }
  console.log(`✓ ${label}: all table columns fit without clipping`);
}

const copy = {
  'ru-RU': {
    addService: 'Добавить услугу',
    save: 'Сохранить',
    approve: 'Согласовать предложение',
    contract: 'Сформировать договор',
    sign: 'Отметить договор подписанным',
    confirm: 'Подтвердить суммы и сроки',
    complete: 'Отметить выполненным',
    closing: 'Сформировать акт и счёт',
    issue: 'Выставить счёт',
    payment: 'Имитировать оплату',
    match: 'Сопоставить оплату',
    cost: 'Добавить фактические затраты',
    explain: 'Подготовить проверяемое объяснение',
  },
  'en-US': {
    addService: 'Add service',
    save: 'Save',
    approve: 'Approve proposal',
    contract: 'Create contract',
    sign: 'Mark contract as signed',
    confirm: 'Confirm amounts and deadlines',
    complete: 'Mark completed',
    closing: 'Create certificate & invoice',
    issue: 'Issue invoice',
    payment: 'Simulate payment',
    match: 'Match payment',
    cost: 'Add actual cost',
    explain: 'Prepare verifiable explanation',
  },
};

async function runScenario(language) {
  const t = copy[language];
  await navigate('/pulse', 'app-pulse');
  await setLanguage(language);
  await navigate('/proposals/new', '.proposal-editor');
  await setInput('.proposal-editor .form-grid input', `Browser ${language} demo`);
  await clickText(t.addService);
  await waitFor(
    "document.querySelectorAll('.line-item:not(.line-item--head) input').length === 4",
    'line item appears',
  );
  await setInput('.line-item:not(.line-item--head) input', 'Design and development', 0);
  await setInput('.line-item:not(.line-item--head) input', 2, 1);
  await setInput('.line-item:not(.line-item--head) input', 100000, 2);
  await setInput('.line-item:not(.line-item--head) input', 40000, 3);

  const otherLanguage = language === 'ru-RU' ? 'en-US' : 'ru-RU';
  await setLanguage(otherLanguage);
  const preserved = await evaluate(
    "document.querySelector('.proposal-editor .form-grid input').value",
  );
  if (preserved !== `Browser ${language} demo`)
    throw new Error('Unsaved title was lost while switching language');
  await setLanguage(language);
  await clickText(t.save);
  await waitFor("document.querySelector('.toast')", 'proposal saved notification');
  await clickText(t.approve);
  await waitFor(
    `[...document.querySelectorAll('button')].some((button) => button.innerText.includes(${JSON.stringify(t.contract)}))`,
    'proposal approved',
  );
  await clickText(t.contract);
  await waitFor("document.querySelector('app-contract-detail')", 'contract detail');

  await clickText(t.sign);
  await waitFor(
    `[...document.querySelectorAll('button')].some((button) => button.innerText.includes(${JSON.stringify(t.confirm)}))`,
    'signed contract and extracted terms',
  );
  await clickText(t.confirm);
  const projectId = await evaluate(
    `JSON.parse(localStorage.getItem('potok.data')).projects.find((project) => project.contractId === location.pathname.split('/').pop()).id`,
  );
  await evaluate(
    `document.querySelector('a[href="/projects/' + ${JSON.stringify(projectId)} + '"]').click()`,
  );
  await waitFor("document.querySelector('app-project-detail')", 'project detail');
  await clickText(t.complete);
  await waitFor(
    `[...document.querySelectorAll('button')].some((button) => button.innerText.includes(${JSON.stringify(t.closing)}))`,
    'closing document action',
  );
  await clickText(t.closing);
  await waitFor("document.querySelector('app-money')", 'money register');

  const invoiceId = await evaluate(
    `JSON.parse(localStorage.getItem('potok.data')).invoices.find((invoice) => invoice.projectId === ${JSON.stringify(projectId)}).id`,
  );
  await waitFor(`document.querySelector('tr.focused')`, 'new invoice highlighted');
  await clickText(t.issue, "document.querySelector('tr.focused')");
  await waitFor(
    `JSON.parse(localStorage.getItem('potok.data')).invoices.find((invoice) => invoice.id === ${JSON.stringify(invoiceId)}).status === 'issued'`,
    'invoice issued',
  );
  await clickText(t.payment, "document.querySelector('tr.focused')");
  await waitFor("document.querySelector('.modal')", 'payment dialog');
  await clickText(t.payment, "document.querySelector('.modal')");
  await waitFor("!document.querySelector('.modal')", 'payment created');
  await clickText(t.match, "document.querySelector('.matching-card')");
  await waitFor(
    `JSON.parse(localStorage.getItem('potok.data')).invoices.find((invoice) => invoice.id === ${JSON.stringify(invoiceId)}).status === 'paid'`,
    'invoice fully paid',
  );

  await navigate(`/projects/${projectId}`, 'app-project-detail');
  for (const [category, description, amount, source] of [
    ['labor', 'Planned team labor', 80000, 'Timesheets'],
    ['rework', 'Additional revisions', 30000, 'Approved change request'],
  ]) {
    const scope =
      "document.querySelectorAll('app-project-detail aside.page-stack > section.card')[1]";
    await setInput('input', description, 0, scope);
    await setInput('select', category, 0, scope);
    await setInput('input', amount, 1, scope);
    await setInput('input', source, 2, scope);
    await clickText(t.cost, scope);
  }
  await waitFor(
    `JSON.parse(localStorage.getItem('potok.data')).costs.filter((cost) => cost.projectId === ${JSON.stringify(projectId)}).length === 2`,
    'two cost records',
  );
  await evaluate('document.querySelector(\'.calculation-card a[href^="/margins"]\').click()');
  await waitFor("document.querySelector('app-margins')", 'margin analysis');
  await waitFor("document.querySelector('.margin-negative')", 'negative margin variance');
  await clickText(t.explain);
  await waitFor("document.querySelector('app-ai')", 'controlled AI explanation');
  await navigate('/actions', 'app-actions');
  await waitFor(
    `document.querySelector('app-actions').innerText.includes(${JSON.stringify(`Browser ${language} demo`)})`,
    'margin next action',
  );
  await assertNoOverflow(`quote-to-cash ${language}`);
  await screenshot(`actions-${language}`);
  console.log(`✓ Complete quote-to-cash scenario: ${language}`);
}

try {
  mkdirSync(join(root, 'tmp'), { recursive: true });
  if (!(await reachable(baseUrl))) {
    server = spawn(
      process.execPath,
      [
        join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'),
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        '4200',
      ],
      { cwd: root, stdio: 'ignore' },
    );
    await waitHttp(baseUrl, 60000);
  }
  chrome = spawn(
    chromePath(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      '--window-size=1440,1024',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  await waitHttp(`http://127.0.0.1:${debugPort}/json/version`);
  let targets;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    if (targets.some((target) => target.type === 'page')) break;
    await sleep(100);
  }
  const page = targets.find((target) => target.type === 'page');
  cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await navigate('/pulse', 'app-pulse');
  await setLanguage('ru-RU');
  await checkPulseDrilldown(
    'От акта до счёта',
    'Среднее число календарных дней',
    '/money?invoice=',
    'app-money',
  );
  await navigate('/pulse', 'app-pulse');
  await checkPulseDrilldown(
    'Просроченные обязательства',
    'Количество обязательств',
    '/obligations?focus=',
    'app-obligations',
  );
  await navigate('/pulse', 'app-pulse');
  await assertNoOverflow('Pulse desktop RU');
  await screenshot('pulse-desktop-ru');
  await navigate('/documents', 'app-documents');
  await assertNoOverflow('Documents desktop RU (KUI screen.docs)');
  await assertTableFits('Documents desktop RU', '.documents-table');
  await screenshot('documents-desktop-ru');
  await navigate('/integrations', 'app-integrations');
  await assertNoOverflow('Integrations desktop RU (KUI screen.integrations)');
  await screenshot('integrations-desktop-ru');
  await navigate('/pulse', 'app-pulse');
  await setLanguage('en-US');
  await assertNoOverflow('Pulse desktop EN');
  await screenshot('pulse-desktop-en');
  await navigate('/money', 'app-money');
  await assertNoOverflow('Money desktop EN');
  await screenshot('money-desktop-en');
  await navigate('/documents', 'app-documents');
  await assertNoOverflow('Documents desktop EN');
  await assertTableFits('Documents desktop EN', '.documents-table');
  await screenshot('documents-desktop-en');
  await navigate('/integrations', 'app-integrations');
  await assertNoOverflow('Integrations desktop EN');
  await screenshot('integrations-desktop-en');
  await navigate('/proposals/proposal-atlas', 'app-proposal-editor');
  await assertNoOverflow('Proposal editor desktop EN');
  await screenshot('proposal-desktop-en');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate('/pulse', 'app-pulse');
  await assertNoOverflow('Pulse mobile EN');
  await screenshot('pulse-mobile-en');
  await clickText('Acceptance to invoice', "document.querySelector('app-pulse')");
  await waitFor("document.querySelector('.source-panel')", 'mobile metric source panel');
  await assertNoOverflow('Pulse mobile EN drill-down');
  await evaluate("document.querySelector('.source-panel').scrollIntoView({ block: 'start' })");
  await sleep(100);
  await screenshot('pulse-mobile-en-drilldown');
  await clickText('Acceptance to invoice', "document.querySelector('app-pulse')");
  const mobileRoutes = [
    ['/deals', 'app-deals'],
    ['/clients', 'app-clients'],
    ['/clients/client-vector', 'app-client-detail'],
    ['/proposals', 'app-proposals'],
    ['/proposals/proposal-atlas', 'app-proposal-editor'],
    ['/contracts', 'app-contracts'],
    ['/contracts/contract-vector', 'app-contract-detail'],
    ['/projects', 'app-projects'],
    ['/projects/project-vector', 'app-project-detail'],
    ['/obligations', 'app-obligations'],
    ['/money', 'app-money'],
    ['/documents', 'app-documents'],
    ['/margins', 'app-margins'],
    ['/actions', 'app-actions'],
    ['/integrations', 'app-integrations'],
    ['/migration', 'app-migration'],
    ['/ai', 'app-ai'],
    ['/portal', 'app-portal'],
    ['/search', 'app-search'],
  ];
  for (const [path, selector] of mobileRoutes) {
    await navigate(path, selector);
    if (path === '/portal')
      await clickText('EN', "document.querySelector('.portal-header .language-switch')", true);
    await assertNoOverflow(`${path} mobile EN`);
    await screenshot(`${path.split('/').filter(Boolean).join('-')}-mobile-en`);
  }
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false,
  });

  await runScenario('ru-RU');
  await navigate('/pulse', 'app-pulse');
  await evaluate('document.querySelector(\'[data-testid="reset-demo"]\').click()');
  await waitFor("document.querySelector('.modal')", 'reset confirmation');
  await clickText('Подтвердить', "document.querySelector('.modal')");
  await waitFor("!document.querySelector('.modal')", 'reset complete');
  await runScenario('en-US');

  if (browserErrors.length)
    throw new Error(`Browser runtime errors: ${JSON.stringify(browserErrors)}`);
  console.log('All browser checks passed.');
} catch (error) {
  console.error(error.stack ?? error);
  process.exitCode = 1;
} finally {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    const stopped = new Promise((resolvePromise) => chrome.once('exit', resolvePromise));
    chrome.kill();
    await Promise.race([stopped, sleep(2000)]);
  }
  server?.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`Temporary Chrome profile could not be removed: ${error.message}`);
  }
}
