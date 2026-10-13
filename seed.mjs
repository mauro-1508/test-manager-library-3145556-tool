#!/usr/bin/env node
// Demo data seeder for Manager Library. Uses the HTTP API only.

const DEFAULT_API_URL = 'http://localhost:8000/api/v1';
const MAX_PAGE_SIZE = 50;
const BOOK_COUNT = 40;
const MAX_COPIES = 4;
const MAX_UNRETURNED_PER_MEMBER = 3;
const OVERDUE_MEMBER_COUNT = 3;
const REMAINING_LOAN_COUNT = 12;
const PHASES = ['all', 'overdue', 'rest'];
const ISBN_PREFIX = '978958';
const DOCUMENT_PREFIX = '10203040';

const CATALOGUE = [
  ['Cien años de soledad', 'Gabriel García Márquez'],
  ['El amor en los tiempos del cólera', 'Gabriel García Márquez'],
  ['Pedro Páramo', 'Juan Rulfo'],
  ['Rayuela', 'Julio Cortázar'],
  ['La casa de los espíritus', 'Isabel Allende'],
  ['Ficciones', 'Jorge Luis Borges'],
  ['El túnel', 'Ernesto Sábato'],
  ['La ciudad y los perros', 'Mario Vargas Llosa'],
  ['Como agua para chocolate', 'Laura Esquivel'],
  ['María', 'Jorge Isaacs'],
  ['Breve historia del tiempo', 'Stephen Hawking'],
  ['El gen egoísta', 'Richard Dawkins'],
  ['Cosmos', 'Carl Sagan'],
  ['El origen de las especies', 'Charles Darwin'],
  ['Los botones de Pandora', 'Marcelo Gleiser'],
  ['La doble hélice', 'James Watson'],
  ['Física para todos', 'Paul Hewitt'],
  ['Química general', 'Raymond Chang'],
  ['Una breve historia de casi todo', 'Bill Bryson'],
  ['El hombre que calculaba', 'Malba Tahan'],
  ['Código limpio', 'Robert C. Martin'],
  ['Arquitectura limpia', 'Robert C. Martin'],
  ['El programador pragmático', 'Andrew Hunt'],
  ['Patrones de diseño', 'Erich Gamma'],
  ['Introducción a los algoritmos', 'Thomas Cormen'],
  ['Redes de computadoras', 'Andrew Tanenbaum'],
  ['Sistemas operativos modernos', 'Andrew Tanenbaum'],
  ['Refactorización', 'Martin Fowler'],
  ['Domain-Driven Design', 'Eric Evans'],
  ['Diseño de aplicaciones intensivas en datos', 'Martin Kleppmann'],
  ['Las venas abiertas de América Latina', 'Eduardo Galeano'],
  ['Historia de Colombia', 'Jorge Orlando Melo'],
  ['El laberinto de la soledad', 'Octavio Paz'],
  ['Sapiens: de animales a dioses', 'Yuval Noah Harari'],
  ['Armas, gérmenes y acero', 'Jared Diamond'],
  ['Memoria del fuego', 'Eduardo Galeano'],
  ['El principito', 'Antoine de Saint-Exupéry'],
  ['Platero y yo', 'Juan Ramón Jiménez'],
  ['Cuentos de la selva', 'Horacio Quiroga'],
  ['Manuelito el pastor', 'Rafael Pombo'],
];

const MEMBERS = [
  'Camila Rodríguez', 'Andrés Gómez', 'Valentina Torres', 'Santiago Herrera', 'Daniela Castro',
  'Mateo Vargas', 'Sofía Ramírez', 'Julián Ortiz', 'Laura Mendoza', 'Sebastián Peña',
];

class ApiError extends Error {
  constructor(status, body) {
    super(`${status} ${body?.code ?? 'UNKNOWN'}: ${body?.message ?? 'no message'}`);
    this.status = status;
    this.code = body?.code;
  }
}

function readConfig(env, argv) {
  const missing = ['ADMIN_USERNAME', 'ADMIN_PASSWORD'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  const phaseArg = argv.find((arg) => arg.startsWith('--phase='));
  const phase = phaseArg ? phaseArg.slice('--phase='.length) : 'all';
  if (!PHASES.includes(phase)) {
    throw new Error(`Invalid --phase "${phase}". Use one of: ${PHASES.join(', ')}`);
  }
  return {
    apiUrl: (env.API_URL ?? DEFAULT_API_URL).replace(/\/+$/, ''),
    username: env.ADMIN_USERNAME,
    password: env.ADMIN_PASSWORD,
    phase,
  };
}

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  async request(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new ApiError(response.status, data);
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body ?? {}); }

  async login(username, password) {
    const data = await this.post('/auth/login', { username, password });
    this.token = data.access_token;
  }
}

function isbn13(index) {
  const digits = `${ISBN_PREFIX}${String(index).padStart(6, '0')}`;
  const sum = [...digits].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return `${digits}${(10 - (sum % 10)) % 10}`;
}

function documentNumber(index) {
  return `${DOCUMENT_PREFIX}${String(index).padStart(2, '0')}`;
}

async function findByTerm(api, resource, term, matches) {
  const page = await api.get(`/${resource}?q=${encodeURIComponent(term)}&size=${MAX_PAGE_SIZE}`);
  return page.items.find(matches) ?? null;
}

async function createOrReuse(api, resource, payload, term, matches) {
  try {
    return await api.post(`/${resource}`, payload);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    const existing = await findByTerm(api, resource, term, matches);
    if (!existing) console.warn(`  skipped existing ${resource} ${term} (could not be looked up)`);
    return existing;
  }
}

async function seedBooks(api, categories) {
  const books = [];
  for (let i = 0; i < BOOK_COUNT; i += 1) {
    const [title, author] = CATALOGUE[i];
    const isbn = isbn13(i + 1);
    const book = await createOrReuse(
      api,
      'books',
      {
        title,
        author,
        isbn,
        category_id: categories[i % categories.length].id,
        total_copies: (i % MAX_COPIES) + 1,
      },
      isbn,
      (candidate) => candidate.isbn === isbn,
    );
    books.push(book);
  }
  return books;
}

async function seedMembers(api) {
  const members = [];
  for (let i = 0; i < MEMBERS.length; i += 1) {
    const document = documentNumber(i + 1);
    members.push(
      await createOrReuse(
        api,
        'members',
        { full_name: MEMBERS[i], document_number: document },
        document,
        (candidate) => candidate.document_number === document,
      ),
    );
  }
  return members;
}

// Deterministic plan: the first loans are the ones meant to be overdue (one line each, distinct members).
// Every book is used at most once, so availability never blocks a loan.
function buildLoanPlan() {
  const plan = [];
  let nextBook = 0;
  for (let i = 0; i < OVERDUE_MEMBER_COUNT; i += 1) {
    plan.push({ memberIndex: i, bookIndexes: [nextBook], overdue: true, returnFirstLine: false });
    nextBook += 1;
  }
  const otherMembers = MEMBERS.length - OVERDUE_MEMBER_COUNT;
  for (let k = 0; k < REMAINING_LOAN_COUNT; k += 1) {
    const lineCount = (k % MAX_UNRETURNED_PER_MEMBER) + 1;
    const bookIndexes = Array.from({ length: lineCount }, (_, n) => nextBook + n);
    nextBook += lineCount;
    plan.push({
      memberIndex: OVERDUE_MEMBER_COUNT + (k % otherMembers),
      bookIndexes,
      overdue: false,
      returnFirstLine: k % MAX_UNRETURNED_PER_MEMBER === MAX_UNRETURNED_PER_MEMBER - 1,
    });
  }
  return plan;
}

function selectPlan(plan, phase) {
  if (phase === 'overdue') return plan.filter((entry) => entry.overdue);
  if (phase === 'rest') return plan.filter((entry) => !entry.overdue);
  return plan;
}

class LoanSeeder {
  constructor(api, members, books) {
    this.api = api;
    this.members = members;
    this.books = books;
    this.unreturnedByMember = new Map();
    this.created = 0;
    this.returned = 0;
  }

  unreturned(memberId) {
    if (!this.unreturnedByMember.has(memberId)) this.unreturnedByMember.set(memberId, []);
    return this.unreturnedByMember.get(memberId);
  }

  async returnLine(loanId, itemId, memberId) {
    await this.api.post(`/loans/${loanId}/items/${itemId}/return`);
    const lines = this.unreturned(memberId);
    this.unreturnedByMember.set(memberId, lines.filter((line) => line.itemId !== itemId));
    this.returned += 1;
  }

  async makeRoomFor(memberId, lineCount) {
    while (this.unreturned(memberId).length + lineCount > MAX_UNRETURNED_PER_MEMBER) {
      const oldest = this.unreturned(memberId)[0];
      await this.returnLine(oldest.loanId, oldest.itemId, memberId);
    }
  }

  async run(entry) {
    const member = this.members[entry.memberIndex];
    const books = entry.bookIndexes.map((index) => this.books[index]);
    if (!member || books.some((book) => !book)) {
      console.warn('  loan skipped: member or book is missing');
      return;
    }
    const label = entry.overdue ? 'the 3 that will be overdue' : 'regular';
    try {
      if (!entry.overdue) await this.makeRoomFor(member.id, books.length);
      const loan = await this.api.post('/loans', {
        member_id: member.id,
        items: books.map((book) => ({ book_id: book.id })),
      });
      this.created += 1;
      this.unreturned(member.id).push(...loan.items.map((item) => ({ loanId: loan.id, itemId: item.id })));
      console.log(`  loan ${loan.id} for "${member.full_name}" with ${books.length} line(s) [${label}]`);
      if (entry.returnFirstLine) await this.returnLine(loan.id, loan.items[0].id, member.id);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      console.warn(`  loan for "${member.full_name}" rejected [${label}]: ${error.message}`);
    }
  }
}

function currentMonthRange(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const toIsoDate = (date) => date.toISOString().slice(0, 10);
  return {
    from: toIsoDate(new Date(Date.UTC(year, month, 1))),
    to: toIsoDate(new Date(Date.UTC(year, month + 1, 0))),
  };
}

async function printSummary(api, seeder, bookCount, memberCount) {
  const overdue = await api.get(`/loans/overdue?size=${MAX_PAGE_SIZE}`);
  const { from, to } = currentMonthRange();
  const report = await api.get(`/reports/most-borrowed?from=${from}&to=${to}`);
  console.log('\nSummary');
  console.log(`  books available in the catalogue: ${bookCount}`);
  console.log(`  members available: ${memberCount}`);
  console.log(`  loans created: ${seeder.created}`);
  console.log(`  lines returned: ${seeder.returned}`);
  console.log(`  lines currently overdue (GET /loans/overdue): ${overdue.total ?? overdue.items.length}`);
  console.log(`  report rows ${from}..${to} (GET /reports/most-borrowed): ${report.rows.length}`);
}

async function main() {
  const config = readConfig(process.env, process.argv.slice(2));
  const api = new ApiClient(config.apiUrl);
  await api.login(config.username, config.password);

  const categories = await api.get('/categories');
  const categoryList = Array.isArray(categories) ? categories : categories.items;

  console.log('Creating books...');
  const books = await seedBooks(api, categoryList);
  console.log('Creating members...');
  const members = await seedMembers(api);

  console.log(`Creating loans (phase: ${config.phase})...`);
  const seeder = new LoanSeeder(api, members, books);
  for (const entry of selectPlan(buildLoanPlan(), config.phase)) {
    await seeder.run(entry);
  }

  await printSummary(api, seeder, books.filter(Boolean).length, members.filter(Boolean).length);
}

main().catch((error) => {
  console.error(`Seeding failed: ${error.message}`);
  process.exit(1);
});
