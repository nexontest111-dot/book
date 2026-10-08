(() => {
  const status = document.querySelector("#status");
  const form = document.querySelector("#auth-form");
  const controls = document.querySelector("#controls");
  const signedIn = document.querySelector("#signed-in");
  const email = document.querySelector("#email");
  const password = document.querySelector("#password");
  let client, busy = false, revision = 0;
  const tell = message => { status.textContent = message; };
  const explain = error => {
    if (error?.status === 429 || error?.code === "over_email_send_rate_limit") return "요청이 많습니다. 잠시 후 다시 시도해주세요.";
    if (error?.code === "email_not_confirmed") return "이메일 인증을 먼저 완료해주세요.";
    if (error?.code === "email_address_not_authorized") return "현재 개발용 메일 발송은 프로젝트 팀 계정으로 제한돼 있습니다.";
    if (error?.code === "weak_password") return "비밀번호가 보안 조건에 맞지 않습니다. 더 긴 비밀번호를 사용해주세요.";
    if (error?.code === "invalid_credentials") return "이메일과 비밀번호를 확인해주세요.";
    return "요청을 완료하지 못했습니다. 입력과 네트워크 상태를 확인하고 다시 시도해주세요.";
  };
  async function showSession(session) {
    const version = ++revision;
    signedIn.hidden = true;
    form.hidden = false;
    document.querySelector("#account-email").textContent = "";
    if (!session) return;
    try {
      const response = await fetch("/api/me", { headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store", signal: AbortSignal.timeout(10000) });
      const body = await response.json();
      if (version !== revision) return;
      if (!response.ok) {
        tell(body.error?.code === "EMAIL_NOT_CONFIRMED" ? "이메일 인증을 완료해주세요." : "로그인을 서버에서 확인하지 못했습니다. 다시 로그인하거나 잠시 후 재시도해주세요.");
        return;
      }
      document.querySelector("#account-email").textContent = body.data.email ?? "";
      signedIn.hidden = false; form.hidden = true;
      tell("서버에서 로그인을 확인했습니다.");
    } catch {
      if (version === revision) tell("서버에 연결하지 못했습니다. 잠시 후 다시 로그인해주세요.");
    }
  }
  async function perform(task) {
    if (busy) return;
    busy = true; controls.disabled = true;
    document.querySelector("#signout").disabled = true;
    try { await task(); } catch { tell("서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."); }
    finally { busy = false; controls.disabled = !client; document.querySelector("#signout").disabled = false; }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!client) return;
    const signup = event.submitter?.value === "signup";
    if (signup && password.value.length < 8) { tell("회원가입 비밀번호는 8자 이상 입력해주세요."); return; }
    perform(async () => {
      tell(signup ? "회원가입을 요청하고 있습니다." : "로그인하고 있습니다.");
      const credentials = { email: email.value.trim(), password: password.value };
      const result = signup
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + "/auth" } })
        : await client.auth.signInWithPassword(credentials);
      password.value = "";
      if (result.error) { tell(explain(result.error)); return; }
      if (signup) tell("가입 가능한 이메일이면 인증 메일이 발송됩니다. 메일함과 스팸함을 확인해주세요.");
      if (result.data.session) await showSession(result.data.session);
    });
  });
  document.querySelector("#resend").addEventListener("click", () => {
    if (!client || !email.checkValidity() || !email.value) { tell("이메일을 입력해주세요."); email.focus(); return; }
    perform(async () => {
      const { error } = await client.auth.resend({ type: "signup", email: email.value.trim(),
        options: { emailRedirectTo: location.origin + "/auth" } });
      tell(error ? explain(error) : "인증 대기 중인 계정이면 메일이 발송됩니다. 잠시 후 메일함을 확인해주세요.");
    });
  });
  document.querySelector("#signout").addEventListener("click", () => perform(async () => {
    const { error } = await client.auth.signOut();
    if (error) { tell("로그아웃하지 못했습니다. 다시 시도해주세요."); return; }
    await showSession(null); password.value = ""; tell("로그아웃했습니다.");
  }));
  async function initialize() {
    try {
      if (!window.supabase?.createClient) throw new Error("SDK unavailable");
      const response = await fetch("/api/auth/config", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("Auth unavailable");
      const config = await response.json();
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { storageKey: "book-development-auth", persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) }
      });
      client.auth.onAuthStateChange((_event, session) => {
        // SDK callbacks must not await another auth operation.
        setTimeout(() => { showSession(session); }, 0);
      });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      controls.disabled = false;
      tell("이메일과 비밀번호로 로그인하거나 회원가입하세요.");
      await showSession(data.session);
      // Remove callback tokens and error details from the browser URL.
      if (location.hash) history.replaceState(null, "", location.pathname);
    } catch {
      client = null; controls.disabled = true;
      tell("로그인 서비스를 불러오지 못했습니다. 네트워크 상태를 확인하고 새로고침해주세요.");
    }
  }
  initialize();
})();
