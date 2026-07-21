/* ================================================================
   agent-chat.js — Agent 内嵌对话窗口 + 人设选择器（V3 新增）
   ================================================================ */

var agentChatSocket = null;
var agentChatMessages = [];
var agentPersonas = [];
var agentCurrentPersona = 'crab_boss';
var agentConnected = false;
var agentReconnectTimer = null;

// ---- WebSocket 连接 ----
function agentConnect() {
  if (!CONFIG || !CONFIG.agent || !CONFIG.agent.enabled) return;
  if (!authUser) return;

  var wsUrl = CONFIG.agent.wsUrl + '?user_id=' + encodeURIComponent(authUser.id);
  try {
    agentChatSocket = new WebSocket(wsUrl);
    agentChatSocket.onopen = function() {
      agentConnected = true;
      agentUpdateStatus();
      clearTimeout(agentReconnectTimer);
      // 加载人设列表
      agentChatSend({ type: 'get_personas' });
    };
    agentChatSocket.onmessage = function(e) {
      try {
        var msg = JSON.parse(e.data);
        agentHandleMessage(msg);
      } catch(ex) {}
    };
    agentChatSocket.onclose = function() {
      agentConnected = false;
      agentUpdateStatus();
      // 自动重连
      agentReconnectTimer = setTimeout(function() { agentConnect(); }, 5000);
    };
    agentChatSocket.onerror = function() {
      agentChatSocket.close();
    };
  } catch(e) {
    agentConnected = false;
    agentUpdateStatus();
  }
}

function agentDisconnect() {
  if (agentChatSocket) {
    agentChatSocket.onclose = null; // 防止自动重连
    agentChatSocket.close();
    agentChatSocket = null;
  }
  agentConnected = false;
  clearTimeout(agentReconnectTimer);
}

function agentChatSend(data) {
  if (agentChatSocket && agentChatSocket.readyState === WebSocket.OPEN) {
    agentChatSocket.send(JSON.stringify(data));
  }
}

// ---- 消息处理 ----
function agentHandleMessage(msg) {
  switch (msg.type) {
    case 'reply':
      agentChatMessages.push({
        role: 'assistant',
        text: msg.text,
        intent: msg.intent || '',
        timestamp: Date.now()
      });
      agentRenderMessages();
      break;

    case 'personas':
      agentPersonas = msg.personas || [];
      agentCurrentPersona = msg.current || 'crab_boss';
      agentRenderPersonas();
      break;

    case 'persona_set':
      agentCurrentPersona = msg.persona_id;
      agentRenderPersonas();
      var selEl = document.getElementById('agentPersonaSelect');
      if (selEl) selEl.value = agentCurrentPersona;
      showToast(msg.text || '人设已切换');
      break;

    case 'review_logs':
      agentRenderReviewLogs(msg.logs || []);
      break;
  }
}

// ---- 渲染消息列表 ----
function agentRenderMessages() {
  var container = document.getElementById('agentChatMessages');
  if (!container) return;

  var html = '';
  if (agentChatMessages.length === 0) {
    html = '<div class="agent-chat-empty">' +
      '<div class="agent-chat-empty-icon">🦀</div>' +
      '<div class="agent-chat-empty-text">你好！我是蟹老板<br>可以帮你记账、创建待办、打卡<br>也可以查消费、搜信息～</div>' +
      '</div>';
  } else {
    agentChatMessages.forEach(function(m) {
      if (m.role === 'user') {
        html += '<div class="agent-msg agent-msg-user">' +
          '<div class="agent-msg-bubble user">' + escHtml(m.text) + '</div>' +
          '</div>';
      } else {
        html += '<div class="agent-msg agent-msg-bot">' +
          '<div class="agent-msg-avatar">🦀</div>' +
          '<div class="agent-msg-bubble bot">' + m.text + '</div>' +
          '</div>';
      }
    });
  }
  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;
}

// ---- 发送消息 ----
function agentSendMessage() {
  var input = document.getElementById('agentChatInput');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;

  agentChatMessages.push({
    role: 'user',
    text: text,
    timestamp: Date.now()
  });
  agentRenderMessages();

  agentChatSend({ type: 'chat', text: text });
  input.value = '';
  input.focus();
}

// ---- 连接状态 ----
function agentUpdateStatus() {
  var statusEl = document.getElementById('agentStatus');
  if (!statusEl) return;
  statusEl.className = 'agent-status' + (agentConnected ? ' connected' : '');
  statusEl.textContent = agentConnected ? '🟢 在线' : '🔴 离线';
  statusEl.title = agentConnected ? 'Agent 已连接' : 'Agent 未连接，5秒后自动重连';
}

// ---- 人设选择 ----
function agentRenderPersonas() {
  var select = document.getElementById('agentPersonaSelect');
  if (!select) return;

  // 构建人设下拉 + 预览
  var html = '';
  agentPersonas.forEach(function(p) {
    var sel = p.id === agentCurrentPersona ? ' selected' : '';
    html += '<option value="' + p.id + '"' + sel + '>' + p.name + '</option>';
  });
  select.innerHTML = html;

  // 人设卡片预览
  var cards = document.getElementById('agentPersonaCards');
  if (cards) {
    cards.innerHTML = agentPersonas.map(function(p) {
      var active = p.id === agentCurrentPersona ? ' active' : '';
      return '<div class="agent-persona-card' + active + '" data-persona="' + p.id + '">' +
        '<div class="agent-persona-name">' + p.name + '</div>' +
        '<div class="agent-persona-desc">' + (p.description || '') + '</div>' +
        '</div>';
    }).join('');
  }
}

function agentSwitchPersona(personaId) {
  agentChatSend({ type: 'set_persona', persona_id: personaId });
}

// ---- 日志审查 ----
function agentLoadReviewLogs() {
  agentChatSend({ type: 'get_review_logs' });
}

function agentRenderReviewLogs(logs) {
  var container = document.getElementById('agentReviewLogs');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = '<div class="agent-review-empty">暂无待审查记录 🎉</div>';
    return;
  }

  container.innerHTML = logs.map(function(l) {
    var intentLabel = l.final_intent || '未知';
    return '<div class="agent-review-item">' +
      '<div class="agent-review-msg">💬 ' + escHtml(l.raw_text || '') + '</div>' +
      '<div class="agent-review-meta">' +
        '<span>意图: ' + intentLabel + '</span>' +
        '<span>原因: ' + escHtml(l.review_reason || '') + '</span>' +
        '<span>回复: ' + escHtml(l.reply_text || '') + '</span>' +
      '</div>' +
      '</div>';
  }).join('');
}

// ---- 视图切换 ----
function agentSwitchTab(tabName) {
  document.querySelectorAll('#agentChatTabs .agent-tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  var chatPanel = document.getElementById('agentChatPanel');
  var personasPanel = document.getElementById('agentPersonaPanel');
  var reviewPanel = document.getElementById('agentReviewPanel');

  if (chatPanel) chatPanel.style.display = tabName === 'chat' ? '' : 'none';
  if (personasPanel) personasPanel.style.display = tabName === 'persona' ? '' : 'none';
  if (reviewPanel) reviewPanel.style.display = tabName === 'review' ? '' : 'none';

  if (tabName === 'review') agentLoadReviewLogs();
}

// ---- DataModule 注册 ----
var agentChatState = { messages: [] };

DataModule({
  id: 'agentChat',
  state: agentChatState,
  views: ['viewAgentChat'],
  tables: [],
  actions: {},
  init: function() {
    if (currentView === 'viewAgentChat') agentChatState.messages = agentChatMessages;
  },
  render: function(viewName) {
    if (viewName === 'viewAgentChat') {
      agentRenderMessages();
      agentRenderPersonas();
      agentUpdateStatus();
    }
  },
  onNavigate: function(viewName) {
    if (viewName === 'viewAgentChat') {
      var fab = document.getElementById('fabBtn');
      if (fab) fab.style.display = 'none';
      if (!agentChatSocket || agentChatSocket.readyState !== WebSocket.OPEN) {
        agentConnect();
      }
      setTimeout(function() { agentRenderMessages(); agentRenderPersonas(); }, 100);
    }
  },
  escape: function() {
    if (currentView === 'viewAgentChat') navigateTo('viewHome');
  },
  bindEvents: function() {
    // 发送按钮
    var sendBtn = document.getElementById('agentChatSendBtn');
    if (sendBtn) sendBtn.onclick = agentSendMessage;

    // 回车发送
    var input = document.getElementById('agentChatInput');
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          agentSendMessage();
        }
      });
      // IME 兼容
      var composing = false;
      input.addEventListener('compositionstart', function() { composing = true; });
      input.addEventListener('compositionend', function() { composing = false; });
    }

    // 人设选择下拉
    var selEl = document.getElementById('agentPersonaSelect');
    if (selEl) {
      selEl.onchange = function() {
        agentSwitchPersona(this.value);
      };
    }

    // 人设卡片点击（委托）
    var cardsEl = document.getElementById('agentPersonaCards');
    if (cardsEl) {
      cardsEl.onclick = function(e) {
        var card = e.target.closest('.agent-persona-card');
        if (!card) return;
        agentSwitchPersona(card.dataset.persona);
      };
    }

    // Tab 切换
    var tabsEl = document.getElementById('agentChatTabs');
    if (tabsEl) {
      tabsEl.onclick = function(e) {
        var btn = e.target.closest('.agent-tab-btn');
        if (!btn) return;
        agentSwitchTab(btn.dataset.tab);
      };
    }
  },
  migrate: null,
  export: function() { return { agentChatMessages: agentChatMessages }; }
});
