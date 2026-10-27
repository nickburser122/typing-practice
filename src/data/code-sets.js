const CODE_SETS = {
  py: [
    "def load(path, mode='r'): return open(path, mode).read()",
    "items = [x * 2 for x in range(10) if x % 3 == 0]",
    "with open(name) as f: data = {k: v for k, v in json.load(f).items()}",
    "if __name__ == '__main__': sys.exit(main(sys.argv[1:]))",
    "print(f'{name}: {total / count:.2f}', file=sys.stderr)"
  ],
  r: [
    "df <- read.csv('data.csv', stringsAsFactors = FALSE)",
    "res <- df %>% filter(score > 50) %>% group_by(team) %>% summarise(m = mean(score))",
    "ggplot(df, aes(x = age, y = income)) + geom_point() + theme_minimal()",
    "x[is.na(x)] <- median(x, na.rm = TRUE)",
    "fit <- lm(y ~ x1 + x2, data = train); summary(fit)$r.squared"
  ],
  js: [
    "const total = items.reduce((sum, { price }) => sum + price, 0);",
    "const res = await api.get(`/users/${id}`).catch(console.error);",
    "export default function App({ title }) { return <h1>{title}</h1>; }",
    "if (!user?.name || list.length === 0) return null;",
    "document.querySelectorAll('.item').forEach(el => el.classList.toggle('on'));"
  ],
  ts: [
    "interface User { id: number; name: string; tags?: string[]; }",
    "type Handler<T> = (event: T) => Promise<void> | void;",
    "export const pick = <T, K extends keyof T>(o: T, k: K): T[K] => o[k];",
    "const ids = users.map((u): number => u.id!) as readonly number[];"
  ],
  cpp: [
    "std::vector<int> v{1, 2, 3}; for (auto& x : v) x *= 2;",
    "#include <iostream> int main() { std::cout << \"hi\" << std::endl; }",
    "auto it = m.find(key); if (it != m.end()) return it->second;",
    "template <typename T> T max_of(const T& a, const T& b) { return a > b ? a : b; }",
    "std::unique_ptr<Node> n = std::make_unique<Node>(val);"
  ],
  c: [
    "for (size_t i = 0; i < n; i++) sum += arr[i] & 0xFF;",
    "char *p = (char *)malloc(len + 1); if (!p) return -1;",
    "printf(\"%d items at %s\\n\", count, path);",
    "#define MAX(a, b) ((a) > (b) ? (a) : (b))"
  ],
  rust: [
    "let mut map: HashMap<String, Vec<u32>> = HashMap::new();",
    "fn parse(s: &str) -> Result<i32, ParseIntError> { s.trim().parse::<i32>() }",
    "match opt { Some(v) if v > 0 => v, _ => return Err(Error::Empty) }",
    "let xs: Vec<_> = v.iter().map(|x| x * 2).filter(|&x| x > 4).collect();",
    "use std::{fs, io::{self, Read}};"
  ],
  go: [
    "func (s *Server) Handle(w http.ResponseWriter, r *http.Request) {",
    "if err != nil { return fmt.Errorf(\"read %s: %w\", path, err) }",
    "ch := make(chan int, 8); go func() { defer close(ch); ch <- 1 }()",
    "for i, v := range items { m[v.ID] = &items[i] }",
    "var wg sync.WaitGroup; wg.Add(1); defer wg.Done()"
  ],
  java: [
    "public static void main(String[] args) throws IOException {",
    "List<String> names = users.stream().map(User::getName).collect(Collectors.toList());",
    "@Override public boolean equals(Object o) { return o instanceof Pt p && p.x == x; }",
    "try (var in = Files.newBufferedReader(path)) { return in.readLine(); }"
  ],
  cs: [
    "var list = items.Where(x => x.Age >= 18).Select(x => x.Name).ToList();",
    "public async Task<IActionResult> Get(int id) => Ok(await _repo.FindAsync(id));",
    "foreach (var (key, value) in dict) Console.WriteLine($\"{key}: {value}\");",
    "string name = user?.Name ?? throw new ArgumentNullException(nameof(user));"
  ],
  php: [
    "$rows = array_filter($data, fn($r) => $r['active'] && $r['age'] > 18);",
    "foreach ($users as $id => $user) { echo \"<li>{$user->name}</li>\"; }",
    "public function __construct(private readonly PDO $db) {}",
    "$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?'); $stmt->execute([$id]);"
  ],
  ruby: [
    "users.select { |u| u.age >= 18 }.map(&:name).sort_by(&:downcase)",
    "def initialize(name:, role: :guest) = (@name, @role = name, role)",
    "puts \"#{key} => #{value}\" if options[:verbose] && !value.nil?",
    "Rails.application.routes.draw { resources :posts, only: %i[index show] }"
  ],
  swift: [
    "guard let url = URL(string: raw), !raw.isEmpty else { return nil }",
    "let names = people.filter { $0.age > 18 }.map(\\.name).sorted()",
    "struct Card: Identifiable, Codable { var id = UUID(); let title: String }",
    "@State private var count = 0; Button(\"Add\") { count += 1 }"
  ],
  kotlin: [
    "val adults = people.filter { it.age >= 18 }.sortedBy { it.name }",
    "data class User(val id: Long, val name: String, val email: String? = null)",
    "fun <T> List<T>.second(): T? = if (size > 1) this[1] else null",
    "when (val r = load()) { is Ok -> show(r.value); is Err -> log(r.error) }"
  ],
  sql: [
    "SELECT u.id, COUNT(*) AS n FROM users u JOIN orders o ON o.uid = u.id GROUP BY u.id;",
    "INSERT INTO logs (level, msg, ts) VALUES ('warn', 'disk 90%', NOW());",
    "UPDATE accounts SET balance = balance - 25.50 WHERE id = 7 AND balance >= 25.50;",
    "CREATE INDEX idx_users_email ON users (lower(email)) WHERE deleted_at IS NULL;"
  ],
  sh: [
    "find . -name '*.log' -mtime +7 -print0 | xargs -0 rm -f",
    "grep -rn --include='*.py' 'TODO' src/ | sort | uniq -c | head -20",
    "for f in *.png; do convert \"$f\" -resize 50% \"small_${f}\"; done",
    "export PATH=\"$HOME/.local/bin:$PATH\" && source ~/.bashrc",
    "curl -sS -H 'Authorization: Bearer $TOKEN' https://api.example.com/v1/me | jq '.id'",
    "ssh -i ~/.ssh/id_ed25519 -L 8080:localhost:80 deploy@10.0.0.5"
  ],
  git: [
    "git commit -am 'fix: handle empty input' && git push origin main",
    "git rebase -i HEAD~3 && git push --force-with-lease",
    "git log --oneline --graph --decorate --all | head -20",
    "git stash push -m 'wip: parser' -- src/ && git switch -c feature/login",
    "git diff --stat origin/main...HEAD -- '*.ts'"
  ],
  commit: [
    "feat(auth): add refresh token rotation",
    "fix(api): return 404 when the user does not exist",
    "refactor: extract date helpers into utils/time.ts",
    "docs: update the install steps for Windows",
    "chore(deps): bump lodash from 4.17.20 to 4.17.21",
    "perf(db): add index on orders(user_id, created_at)",
    "test: cover the empty cart edge case (#482)",
    "Revert \"feat: dark mode toggle\""
  ],
  docker: [
    "FROM node:20-alpine AS build WORKDIR /app COPY package*.json ./ RUN npm ci",
    "docker run --rm -it -p 8080:80 -v \"$PWD\":/usr/share/nginx/html nginx:alpine",
    "docker compose up -d --build && docker compose logs -f web",
    "RUN apt-get update && apt-get install -y --no-install-recommends curl"
  ],
  yaml: [
    "on: { push: { branches: [main] }, pull_request: {} }",
    "- uses: actions/checkout@v4  with: { fetch-depth: 0 }",
    "image: postgres:16  ports: ['5432:5432']  environment: { POSTGRES_DB: app }",
    "replicas: 3  strategy: { type: RollingUpdate, rollingUpdate: { maxSurge: 1 } }"
  ],
  json: [
    "{\"name\": \"app\", \"version\": \"1.0.0\", \"scripts\": {\"test\": \"jest --watch\"}}",
    "{\"compilerOptions\": {\"strict\": true, \"target\": \"ES2022\", \"paths\": {\"@/*\": [\"src/*\"]}}}",
    "[{\"id\": 1, \"tags\": [\"a\", \"b\"], \"active\": true, \"score\": 9.5, \"parent\": null}]"
  ],
  html: [
    "<div class=\"card\" id=\"main\"><a href=\"/docs\" target=\"_blank\">Docs</a></div>",
    "<input type=\"email\" name=\"email\" placeholder=\"you@example.com\" required>",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<button onclick=\"save()\" class=\"btn btn-primary\" disabled>Save</button>"
  ],
  css: [
    ".grid > .item:nth-child(2n + 1) { grid-template-columns: repeat(3, 1fr); }",
    "a:hover::after { content: '->'; color: #0a84ff; transition: all .2s ease-in-out; }",
    ":root { --gap: clamp(8px, 2vw, 24px); } .box { margin: calc(var(--gap) * 2); }",
    "@media (max-width: 600px) { .nav { display: none !important; } }"
  ],
  md: [
    "## Install  `npm i -D vitest`  then run `npx vitest --ui`",
    "- [x] fix login bug (#123)  - [ ] write tests  - **done**: _parser_",
    "[docs](https://example.com/docs) | `code` | > quote | ![logo](img/logo.png)",
    "1. Clone the repo  2. Run `make setup`  3. Open http://localhost:3000"
  ],
  names: [
    "getUserById fetchOrderItems parseJsonResponse isValidEmail hasPendingChanges",
    "const maxRetryCount = defaultTimeoutMs * retryMultiplier;",
    "firstName lastName emailAddress phoneNumber dateOfBirth",
    "UserProfileService OrderRepository HttpRequestHandler JsonWebToken ApiClient",
    "class PaymentGatewayAdapter extends BaseNotificationHandler {}",
    "get_user_by_id fetch_order_items parse_json_response is_valid_email has_pending_changes",
    "max_retry_count = default_timeout_ms * retry_multiplier",
    "MAX_RETRY_COUNT DEFAULT_TIMEOUT_MS API_BASE_URL LOG_LEVEL_DEBUG IS_PRODUCTION",
    "export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;",
    "user-profile-card order-summary-table nav-bar-item btn-primary-outline",
    "--color-text-muted: var(--brand-accent-strong);",
    "userId user_id UserId USER_ID user-id"
  ],
  regex: [
    "^(?=.*\\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$",
    "\\b\\w+@\\w+\\.(com|org|net)\\b",
    "(\\d{4})-(\\d{2})-(\\d{2})T[\\d:.]+Z?",
    "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
  ]
};

const CODE_IDS = Object.keys(CODE_SETS);

const CODE_NAMES = { py: "Python", r: "R", js: "JavaScript", ts: "TypeScript", cpp: "C++", c: "C", rust: "Rust", go: "Go", java: "Java", cs: "C#", php: "PHP", ruby: "Ruby", swift: "Swift", kotlin: "Kotlin", sql: "SQL", sh: "Shell", git: "Git", commit: "Commit messages", docker: "Docker", yaml: "YAML", json: "JSON", html: "HTML", css: "CSS", md: "Markdown", regex: "Regex", names: "Naming styles" };

export { CODE_IDS, CODE_NAMES, CODE_SETS };
