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
  const memberBox = document.querySelector("#member");
  const memberForm = document.querySelector("#member-form");
  const memberControls = document.querySelector("#member-controls");
  const displayName = document.querySelector("#display-name");
  const memberSave = document.querySelector("#member-save");
  const MEMBER_ERRORS = {
    UNAUTHORIZED: "로그인이 만료됐습니다. 다시 로그인해주세요.",
    EMAIL_NOT_CONFIRMED: "이메일 인증을 완료해주세요.",
    INVALID_DISPLAY_NAME: "표시 이름은 앞뒤 공백을 뺀 1~80자로, 제어 문자 없이 입력해주세요.",
    JSON_REQUIRED: "요청 형식이 올바르지 않습니다. 새로고침 후 다시 시도해주세요.",
    BODY_TOO_LARGE: "입력이 너무 깁니다. 표시 이름을 줄여주세요.",
    ORIGIN_NOT_ALLOWED: "허용되지 않은 접속 경로입니다. 공식 주소에서 다시 시도해주세요.",
    MEMBER_SETUP_REQUIRED: "회원 정보 저장 준비 중입니다. 잠시 후 다시 시도해주세요.",
    DATABASE_NOT_CONFIGURED: "회원 정보 저장 준비 중입니다. 잠시 후 다시 시도해주세요.",
    DATABASE_UNAVAILABLE: "서버 데이터 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
    AUTH_UNAVAILABLE: "로그인 확인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해주세요."
  };
  let memberBusy = false, memberState = "", currentUserId = null, lastServerName = null;
  const API_TIMEOUT = 25000;
  const retryButton = document.querySelector("#member-retry");
  function renderMember(membership, member) {
    memberBox.hidden = false;
    const nameLine = document.querySelector("#member-name");
    const note = document.querySelector("#member-note");
    nameLine.hidden = true;
    document.querySelector("#member-name-value").textContent = "";
    memberControls.disabled = false; retryButton.hidden = true; memberState = membership; lastServerName = member?.displayName ?? null;
    if (membership === "unavailable") {
      document.querySelector("#member-title").textContent = "회원 정보";
      note.textContent = "회원 정보를 잠시 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
      memberControls.disabled = true; retryButton.hidden = false;
    } else if (membership === "setup_required") {
      document.querySelector("#member-title").textContent = "회원 정보 저장 준비 중";
      note.textContent = "회원 정보 저장 기능을 준비하고 있습니다. 준비가 끝나면 표시 이름을 등록할 수 있습니다.";
      memberControls.disabled = true; displayName.value = "";
    } else if (membership === "active" && member) {
      document.querySelector("#member-title").textContent = "회원 정보";
      document.querySelector("#member-name-value").textContent = member.displayName ?? "";
      nameLine.hidden = false; note.textContent = "";
      displayName.value = member.displayName ?? ""; memberSave.textContent = "표시 이름 수정";
    } else {
      document.querySelector("#member-title").textContent = "가입 완료";
      note.textContent = "서비스에서 사용할 표시 이름을 입력하면 가입이 완료됩니다.";
      displayName.value = ""; memberSave.textContent = "가입 완료";
    }
  }
  memberForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (memberBusy || !client) return;
    const name = displayName.value.trim();
    if (!name || [...name].length > 80) { tell(MEMBER_ERRORS.INVALID_DISPLAY_NAME); displayName.focus(); return; }
    memberBusy = true; memberControls.disabled = true;
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) { tell(MEMBER_ERRORS.UNAUTHORIZED); return; }
      const startUserId = data.session.user?.id ?? null;
      tell("표시 이름을 저장하고 있습니다.");
      const response = await fetch("/api/me/membership", { method: "PUT", cache: "no-store",
        headers: { Authorization: "Bearer " + data.session.access_token, "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }), signal: AbortSignal.timeout(API_TIMEOUT) });
      let body = null;
      try { body = await response.json(); } catch { /* non-JSON error body */ }
      if (!startUserId || startUserId !== currentUserId || signedIn.hidden) return; // user changed or signed out
      if (!response.ok || !body?.member) {
        tell(MEMBER_ERRORS[body?.error?.code] ?? "표시 이름을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
        if (["MEMBER_SETUP_REQUIRED", "DATABASE_NOT_CONFIGURED"].includes(body?.error?.code)) renderMember("setup_required", null);
        return;
      }
      revision++; // invalidate any older in-flight GET /api/me
      renderMember("active", body.member);
      tell(response.status === 201 ? "가입이 완료됐습니다." : "표시 이름을 수정했습니다.");
    } catch {
      tell("서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      memberBusy = false;
      if (!memberBox.hidden && memberState !== "setup_required" && memberState !== "unavailable") memberControls.disabled = false;
    }
  });
  async function showSession(session) {
    const version = ++revision;
    const sameUser = session && session.user?.id === currentUserId && !signedIn.hidden;
    if (!sameUser) {
      currentUserId = null;
      signedIn.hidden = true;
      form.hidden = false;
      memberBox.hidden = true; displayName.value = ""; memberState = "";
      document.querySelector("#account-email").textContent = "";
    }
    if (!session) return;
    try {
      const response = await fetch("/api/me", { headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store", signal: AbortSignal.timeout(API_TIMEOUT) });
      const body = await response.json();
      if (version !== revision) return;
      if (!response.ok) {
        if (sameUser) renderMember("unavailable", null);
        tell(body.error?.code === "EMAIL_NOT_CONFIRMED" ? "이메일 인증을 완료해주세요." : "로그인을 서버에서 확인하지 못했습니다. 다시 로그인하거나 잠시 후 재시도해주세요.");
        return;
      }
      document.querySelector("#account-email").textContent = body.data.email ?? "";
      signedIn.hidden = false; form.hidden = true;
      currentUserId = session.user?.id ?? null;
      const keepInput = sameUser && memberState === body.membership && (body.membership !== "active" || lastServerName === (body.member?.displayName ?? null));
      if (!keepInput) renderMember(body.membership, body.member);
      tell(body.membership === "unavailable" ? "로그인은 확인했지만 회원 정보를 불러오지 못했습니다." : body.membership === "not_provisioned" ? "서버에서 로그인을 확인했습니다. 표시 이름을 입력해 가입을 완료해주세요." : "서버에서 로그인을 확인했습니다.");
    } catch {
      if (version === revision) {
        if (sameUser) renderMember("unavailable", null);
        tell("서버에 연결하지 못했습니다. 잠시 후 다시 로그인해주세요.");
      }
    }
  }
  retryButton.addEventListener("click", async () => {
    if (!client || memberBusy) return;
    retryButton.disabled = true;
    try {
      const { data } = await client.auth.getSession();
      if (data.session) { currentUserId = null; signedIn.hidden = true; await showSession(data.session); }
    } finally { retryButton.disabled = false; }
  });
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
        setTimeout(() => {
          // Token refresh for the signed-in user must not reset the member form or state.
          if (session && session.user?.id === currentUserId && !signedIn.hidden) return;
          showSession(session);
        }, 0);
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
