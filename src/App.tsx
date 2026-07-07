import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Command,
  HelpCircle,
  LogIn,
  LogOut,
  Mail,
  LayoutDashboard,
  ListTodo,
  Play,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  Dispatch,
  FocusEvent,
  MouseEvent,
  SetStateAction,
  WheelEvent,
} from 'react'
import { create } from 'zustand'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import './App.css'

const astraAssets = {
  sitting: new URL('../assets/sitting/sitting.png', import.meta.url).href,
  happy: new URL('../assets/happy/happy.png', import.meta.url).href,
  working: new URL('../assets/working/working.png', import.meta.url).href,
  tomato: new URL('../assets/pomodoro/tomato.png', import.meta.url).href,
  timerTomato: new URL('../assets/pomodoro/timertomato.png', import.meta.url)
    .href,
}

type ViewName = 'time' | 'focus' | 'calendar' | 'notebook' | 'pomodoro' | 'smartra'

type AuthUser = {
  id: string
  email: string
}

type AuthSession = {
  access_token: string
  refresh_token?: string
  user: AuthUser
}

type AuthMode = 'signin' | 'signup'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const ASTRA_SESSION_KEY = 'astralite.supabase.session'
const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

const getStoredSession = (): AuthSession | null => {
  try {
    const stored = window.localStorage.getItem(ASTRA_SESSION_KEY)
    return stored ? (JSON.parse(stored) as AuthSession) : null
  } catch {
    return null
  }
}

const storeSession = (session: AuthSession | null) => {
  if (!session) {
    window.localStorage.removeItem(ASTRA_SESSION_KEY)
    return
  }

  window.localStorage.setItem(ASTRA_SESSION_KEY, JSON.stringify(session))
}

const requestSupabaseAuth = async (
  mode: AuthMode,
  email: string,
  password: string,
): Promise<AuthSession> => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trên Vercel.')
  }

  const endpoint = mode === 'signin' ? 'token?grant_type=password' : 'signup'
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.msg || data.message || 'Supabase không thể xác thực tài khoản này.')
  }

  const user = data.user ?? data
  const accessToken = data.access_token ?? data.session?.access_token

  if (!user?.email || !accessToken) {
    throw new Error('Hãy kiểm tra email xác nhận từ Supabase rồi đăng nhập lại.')
  }

  return {
    access_token: accessToken,
    refresh_token: data.refresh_token ?? data.session?.refresh_token,
    user: {
      id: user.id,
      email: user.email,
    },
  }
}
type GuidanceView = ViewName

type ViewTransitionDocument = Document & {
  startViewTransition?: (updateCallback: () => void) => void
}

type Task = {
  id: number
  title: string
  due: string
  done: boolean
}

type CalendarEvent = {
  id: number
  date: string
  time: string
  title: string
  location: string
  tone: 'tomato' | 'star' | 'ink'
}

type CalendarEventDraft = {
  id?: number
  date: string
  time: string
  title: string
  location: string
}

type Note = {
  id: number
  title: string
  body: string
  due: string
  bookmarkColor: string
  bookmarkEmoji: string
}

type CoverSticker = {
  id: number
  emoji: string
  x: number
  y: number
  size: number
}

type NotebookCover = {
  title: string
  color: string
  stickers: CoverSticker[]
}

type NotebookContextMenu =
  | { type: 'cover'; x: number; y: number }
  | { type: 'bookmark'; noteId: number; x: number; y: number }
  | null

type NotebookCustomizer =
  | { type: 'cover'; x: number; y: number }
  | { type: 'bookmark'; noteId: number; x: number; y: number }
  | null

type NotebookFlip =
  | { side: 'cover' | 'left' | 'right'; kind: 'turn' | 'rip' }
  | null

type NotebookTurningPage = {
  side: 'left' | 'right'
  note: Note
  pageNumber: number
} | null

const NOTEBOOK_TURN_DURATION_MS = 1280
const NOTEBOOK_TRAVEL_TURN_MIN_MS = 520
const NOTEBOOK_TRAVEL_TURN_MAX_MS = 980
const NOTEBOOK_RIP_DURATION_MS = 520
const NOTEBOOK_BOOKMARK_COLORS = ['#ffca4f', '#f6b4ad', '#87a0d5', '#ff432b', '#fff1be']

const hasNoteContent = (note?: Note | null) =>
  Boolean(note?.title.trim() || note?.body.trim())

const createBlankNotebookPage = (pageIndex: number): Note => ({
  id: Date.now() + pageIndex * 1000,
  title: '',
  body: '',
  due: `page ${pageIndex + 1}`,
  bookmarkColor: NOTEBOOK_BOOKMARK_COLORS[pageIndex % NOTEBOOK_BOOKMARK_COLORS.length],
  bookmarkEmoji: '',
})

const getBookmarkTitle = (note: Note, pageNumber: number) => {
  const title = note.title.trim()
  if (title) {
    return title
  }

  const bodyPreview = note.body.trim().replace(/\s+/g, ' ')
  return bodyPreview ? bodyPreview.slice(0, 36) : `page ${pageNumber}`
}

type AstraUiState = {
  activeView: ViewName
  isCommandOpen: boolean
  setView: (activeView: ViewName) => void
  openCommand: () => void
  closeCommand: () => void
}

const useAstraUi = create<AstraUiState>((set) => ({
  activeView: 'pomodoro',
  isCommandOpen: false,
  setView: (activeView) => set({ activeView, isCommandOpen: false }),
  openCommand: () => set({ isCommandOpen: true }),
  closeCommand: () => set({ isCommandOpen: false }),
}))

const navItems: Array<{
  view: ViewName
  label: string
  icon: typeof LayoutDashboard
}> = [
  { view: 'calendar', label: 'calendar', icon: CalendarDays },
  { view: 'notebook', label: 'notes', icon: BookOpen },
  { view: 'smartra', label: 'Smartra', icon: Sparkles },
]

const initialTasks: Task[] = [
  { id: 1, title: 'Sketch Astra web home', due: 'today', done: false },
  { id: 2, title: 'Plan calendar flow', due: 'tomorrow', done: false },
  { id: 3, title: 'Drink water before focus', due: 'soon', done: true },
]

const initialNotes: Note[] = [
  {
    id: 1,
    title: 'Astra Web plan',
    body: 'Keep her companion feeling first. Dashboard, calendar, notebook, Pomodoro, and Smartra should all feel like rooms inside the same tiny world.',
    due: 'page 1',
    bookmarkColor: '#ffca4f',
    bookmarkEmoji: '',
  },
  {
    id: 2,
    title: 'Cute but usable',
    body: 'Preserve the soft blue, cream, and indigo palette. Use tomato red, star yellow, and Astra pink as accents.',
    due: 'page 2',
    bookmarkColor: '#f6b4ad',
    bookmarkEmoji: '',
  },
]

const commandItems: Array<{ label: string; detail: string; view: ViewName }> = [
  { label: 'Open clock room', detail: 'See time, date, lunar date, and Unix time', view: 'time' },
  { label: 'Open calendar', detail: 'Jump to monthly planning', view: 'calendar' },
  { label: 'Start focus setup', detail: 'Tune the Pomodoro timer', view: 'pomodoro' },
  { label: 'Write notebook entry', detail: 'Capture a plan or thought', view: 'notebook' },
  { label: 'Open Pomodoro', detail: 'Return to the timer setup', view: 'pomodoro' },
]

const guidanceCopy: Record<GuidanceView, { title: string; body: string }> = {
  time: {
    title: 'Clock',
    body: 'The clock opens this room now. It shows your system time, timezone, date details, lunar date, and Unix timestamp.',
  },
  calendar: {
    title: 'Calendar',
    body: 'Click any date to add a plan. Click an existing plan chip to edit or delete it.',
  },
  focus: {
    title: 'Focus',
    body: 'This view appears only while a Pomodoro session is active. Use it to keep the current tasks gentle and visible.',
  },
  notebook: {
    title: 'Notebook',
    body: 'Use the bookmarks to jump between pages. Pull the curled paper corners to turn pages, and customize cover or bookmark details from the page controls.',
  },
  pomodoro: {
    title: 'Pomodoro',
    body: 'Choose work and break minutes, then start. Astra will switch into the Focus room for the session.',
  },
  smartra: {
    title: 'Smartra',
    body: 'Use Smartra as Astra\'s command palette: jump between rooms, create plans, or ask for help.',
  },
}

const VIETNAM_TIMEZONE = 7

function App() {
  const activeView = useAstraUi((state) => state.activeView)
  const isCommandOpen = useAstraUi((state) => state.isCommandOpen)
  const setView = useAstraUi((state) => state.setView)
  const openCommand = useAstraUi((state) => state.openCommand)
  const closeCommand = useAstraUi((state) => state.closeCommand)
  const now = useCurrentTime()
  const [tasks, setTasks] = useState(initialTasks)
  const [notes, setNotes] = useState(initialNotes)
  const [events, setEvents] = useState(() => createInitialEvents())
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [guidanceView, setGuidanceView] = useState<GuidanceView | null>(null)
  const [pomodoro, setPomodoro] = useState({
    work: 25,
    break: 5,
    running: false,
  })
  const [focusSeconds, setFocusSeconds] = useState(() => pomodoro.work * 60)
  const [contextWheel, setContextWheel] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => getStoredSession())
  const syncStatus = isSupabaseConfigured
    ? 'Supabase session ready'
    : 'Supabase variables missing'

  const handleAuthSuccess = (session: AuthSession) => {
    storeSession(session)
    setAuthSession(session)
  }

  const handleSignOut = () => {
    storeSession(null)
    setAuthSession(null)
  }

  const visibleNavItems = navItems

  const goToView = (view: ViewName) => {
    const transitionDocument = document as ViewTransitionDocument

    if (transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(() => setView(view))
      return
    }

    setView(view)
  }

  const openContextWheel = (event: MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setContextWheel({ x: event.clientX, y: event.clientY })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openCommand()
      }

      if (event.key === 'Escape') {
        closeCommand()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeCommand, openCommand])

  useEffect(() => {
    if (!pomodoro.running) {
      return undefined
    }

    const interval = window.setInterval(() => {
      setFocusSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval)
          setPomodoro((state) => ({ ...state, running: false }))
          setView('pomodoro')
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [pomodoro.running, setView])

  const addTask = () => {
    setTasks((current) => [
      ...current,
      {
        id: Date.now(),
        title: `New Astra task ${current.length + 1}`,
        due: 'unscheduled',
        done: false,
      },
    ])
  }

  const toggleTask = (taskId: number) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId ? { ...task, done: !task.done } : task,
      ),
    )
  }

  const addCalendarEvent = (draft: CalendarEventDraft) => {
    setEvents((current) => [
      ...current,
      {
        id: Date.now(),
        date: draft.date,
        time: draft.time,
        title: draft.title.trim() || 'Untitled Astra plan',
        location: draft.location.trim(),
        tone: current.length % 3 === 0 ? 'tomato' : current.length % 3 === 1 ? 'star' : 'ink',
      },
    ])
  }

  const updateCalendarEvent = (draft: CalendarEventDraft) => {
    if (!draft.id) {
      return
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === draft.id
          ? {
              ...event,
              date: draft.date,
              time: draft.time,
              title: draft.title.trim() || 'Untitled Astra plan',
              location: draft.location.trim(),
            }
          : event,
      ),
    )
  }

  const deleteCalendarEvent = (eventId: number) => {
    setEvents((current) => current.filter((event) => event.id !== eventId))
  }

  const addNote = (note: Note) => {
    setNotes((current) => [...current, note])
  }

  const updateNote = (noteId: number, updates: Partial<Omit<Note, 'id'>>) => {
    setNotes((current) =>
      current.map((note) => (note.id === noteId ? { ...note, ...updates } : note)),
    )
  }

  const renderView = () => {
    if (activeView === 'time') {
      return <TimeView now={now} />
    }

    if (activeView === 'calendar') {
      return (
        <CalendarView
          events={events}
          month={calendarMonth}
          onAddEvent={addCalendarEvent}
          onUpdateEvent={updateCalendarEvent}
          onDeleteEvent={deleteCalendarEvent}
        />
      )
    }

    if (activeView === 'notebook') {
      return (
        <NotebookView
          notes={notes}
          onAddNote={addNote}
          onUpdateNote={updateNote}
        />
      )
    }

    if (activeView === 'pomodoro') {
      return (
        <PomodoroView
          pomodoro={pomodoro}
          setPomodoro={setPomodoro}
          onStartFocus={() => {
            setFocusSeconds(pomodoro.work * 60)
            goToView('focus')
          }}
        />
      )
    }

    if (activeView === 'smartra') {
      return <SmartraView onSelectView={goToView} />
    }

    return (
      <FocusView
        tasks={tasks}
        onAddTask={addTask}
        onToggleTask={toggleTask}
        onEndFocus={() => {
          setPomodoro((current) => ({ ...current, running: false }))
          setFocusSeconds(pomodoro.work * 60)
          goToView('pomodoro')
        }}
        remainingSeconds={focusSeconds}
      />
    )
  }

  if (!authSession) {
    return <AuthWelcome onAuthSuccess={handleAuthSuccess} />
  }

  return (
    <div
      className="astra-app"
      onContextMenu={openContextWheel}
      onClick={() => setContextWheel(null)}
    >
      <div className={`app-shell app-${activeView}`}>
        <aside className="astra-rail" aria-label="Astra navigation">
          <button
            type="button"
            className={`time-card ${activeView === 'time' ? 'active' : ''}`}
            onClick={() => goToView('time')}
            aria-label="Open current time details"
          >
            <Clock aria-hidden="true" />
            <strong>{format(now, 'HH:mm')}</strong>
          </button>

          <nav className="nav-stack" aria-label="Main sections">
            {visibleNavItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  type="button"
                  key={item.view}
                  className={`nav-pill ${activeView === item.view ? 'active' : ''}`}
                  onClick={() => goToView(item.view)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

          <button type="button" className="sign-out-button" onClick={handleSignOut}>
            <LogOut aria-hidden="true" />
            <span>sign out</span>
          </button>
        </aside>

        <main className={`workspace workspace-${activeView}`}>
          <AccountPanel
            email={authSession.user.email}
            syncStatus={syncStatus}
            onSignOut={handleSignOut}
          />
          <div className="workspace-ribbon">
            {activeView === 'calendar' ? (
              <CalendarRibbon
                month={calendarMonth}
                onPrevious={() => setCalendarMonth((month) => subMonths(month, 1))}
                onNext={() => setCalendarMonth((month) => addMonths(month, 1))}
                onJump={(month) => setCalendarMonth(startOfMonth(month))}
                onHelp={() =>
                  setGuidanceView((current) =>
                    current === 'calendar' ? null : 'calendar',
                  )
                }
              />
            ) : null}
          </div>

          {activeView !== 'calendar' ? (
            <button
              type="button"
              className="feature-help-button"
              onClick={() =>
                setGuidanceView((current) =>
                  current === activeView ? null : activeView,
                )
              }
              aria-label={`${guidanceCopy[activeView].title} help`}
            >
              <HelpCircle aria-hidden="true" />
            </button>
          ) : null}

          {guidanceView === activeView ? (
            <GuidancePopover
              title={guidanceCopy[activeView].title}
              body={guidanceCopy[activeView].body}
              onClose={() => setGuidanceView(null)}
            />
          ) : null}

          <AnimatePresence mode="wait">
            <motion.section
              key={activeView}
              className={`view-frame view-${activeView}`}
              initial={{ opacity: 0, y: 18, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.99 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderView()}
            </motion.section>
          </AnimatePresence>
        </main>
      </div>

      <AstraCompanion
        onTomatoClick={() => goToView(pomodoro.running ? 'focus' : 'pomodoro')}
      />

      <CommandOverlay
        isOpen={isCommandOpen}
        onClose={closeCommand}
        onSelect={(view) => goToView(view)}
      />

      <ContextWheel
        position={contextWheel}
        isFocusRunning={pomodoro.running}
        onClose={() => setContextWheel(null)}
        onSelect={(view) => {
          goToView(view)
          setContextWheel(null)
        }}
      />
    </div>
  )
}


function AuthWelcome({ onAuthSuccess }: { onAuthSuccess: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setIsSubmitting(true)

    try {
      const session = await requestSupabaseAuth(mode, email.trim(), password)
      onAuthSuccess(session)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Không thể kết nối Supabase.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-welcome" aria-label="AstraLite login">
      <motion.section
        className="auth-card"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-hero">
          <span className="auth-kicker"><ShieldCheck aria-hidden="true" /> AstraLite cloud room</span>
          <h1>Chào mừng bạn quay lại với Astra.</h1>
          <p>
            Đăng nhập hoặc tạo tài khoản mới để mở lịch, notebook, Pomodoro và Smartra trong cùng một không gian mềm mại.
          </p>
          <div className="auth-preview">
            <img src={astraAssets.happy} alt="Astra welcoming you" />
            <div>
              <strong>Ready for Vercel + Supabase</strong>
              <span>Dùng biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.</span>
            </div>
          </div>
        </div>

        <form className="auth-panel" onSubmit={handleSubmit}>
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
              <LogIn aria-hidden="true" /> Đăng nhập
            </button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
              <UserPlus aria-hidden="true" /> Tạo tài khoản
            </button>
          </div>

          <label className="auth-field">
            <span>Email</span>
            <Mail aria-hidden="true" />
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>

          <label className="auth-field">
            <span>Mật khẩu</span>
            <ShieldCheck aria-hidden="true" />
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Ít nhất 6 ký tự" minLength={6} required />
          </label>

          {!isSupabaseConfigured ? (
            <p className="auth-message warning">Chưa cấu hình Supabase. Thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong Vercel Environment Variables.</p>
          ) : null}
          {message ? <p className="auth-message">{message}</p> : null}

          <button type="submit" className="auth-submit" disabled={isSubmitting || !isSupabaseConfigured}>
            {isSubmitting ? 'Đang kết nối...' : mode === 'signin' ? 'Mở AstraLite' : 'Tạo tài khoản Astra'}
          </button>
        </form>
      </motion.section>
    </main>
  )
}

function AccountPanel({
  email,
  syncStatus,
  onSignOut,
}: {
  email: string
  syncStatus: string
  onSignOut: () => void
}) {
  return (
    <section className="account-panel" aria-label="Account and sync status">
      <div>
        <span>Signed in as</span>
        <strong>{email}</strong>
      </div>
      <p>
        <Save aria-hidden="true" />
        {syncStatus}
      </p>
      <button type="button" onClick={onSignOut}>
        <LogOut aria-hidden="true" />
        Sign out
      </button>
    </section>
  )
}

function TimeView({ now }: { now: Date }) {
  const details = useMemo(() => getTimeDetails(now), [now])

  return (
    <section className="time-layout">
      <motion.div
        className="time-panel cream-panel"
        initial={{ rotate: -1.2 }}
        animate={{ rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 12 }}
      >
        <div className="time-main">
          <span>{details.timezone}</span>
          <h1>
            {details.hour}:{details.minute}:{details.second}
            <small>.{details.millisecond}</small>
            <em>{details.period}</em>
          </h1>
        </div>

        <div className="time-date-card">
          <Clock aria-hidden="true" />
          <strong>{details.weekday}</strong>
          <span>{details.fullDate}</span>
        </div>

        <div className="time-facts">
          <InfoPill label="Year type" value={details.leapYearText} />
          <InfoPill label="Vietnamese lunar date" value={details.lunarDate} />
          <InfoPill label="Unix timestamp" value={details.unixTimestamp} />
          <InfoPill label="Timezone offset" value={details.offset} />
        </div>
      </motion.div>

      <aside className="time-side-note">
        <AstraHead compact />
        <p>
          Clock lives here now. Pomodoro belongs to the tomato on Astra's lap.
        </p>
      </aside>
    </section>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FocusView({
  tasks,
  onAddTask,
  onToggleTask,
  onEndFocus,
  remainingSeconds,
}: {
  tasks: Task[]
  onAddTask: () => void
  onToggleTask: (taskId: number) => void
  onEndFocus: () => void
  remainingSeconds: number
}) {
  return (
    <div className="focus-layout">
      <motion.section
        className="todo-board cream-panel"
        initial={{ y: 18, rotate: -0.6 }}
        animate={{ y: 0, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 150, damping: 16 }}
      >
        <AstraHead />
        <StarSticker className="todo-star" />
        <div className="todo-heading">
          <ListTodo aria-hidden="true" />
          <h1>To do list</h1>
        </div>

        <button type="button" className="task-input" onClick={onAddTask}>
          add task....
        </button>

        <ul className="task-list">
          {tasks.map((task) => (
            <motion.li
              key={task.id}
              className={task.done ? 'done' : ''}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <button
                type="button"
                className="task-check"
                onClick={() => onToggleTask(task.id)}
                aria-label={`Toggle ${task.title}`}
              />
              <span>{task.title}</span>
              <small>{task.due}</small>
            </motion.li>
          ))}
        </ul>

        <button
          type="button"
          className="round-add"
          onClick={onAddTask}
          aria-label="Add task"
        >
          <Plus aria-hidden="true" />
        </button>
        <AstraMini />
      </motion.section>

      <aside className="focus-side">
        <motion.div
          className="focus-callout"
          initial={{ scale: 0.94, rotate: 1.8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 15 }}
        >
          <ClipSticker />
          <strong>time to focus!!</strong>
          <button type="button" className="end-focus-button" onClick={onEndFocus}>
            <Square aria-hidden="true" />
            end focus
          </button>
        </motion.div>
        <div className="tomato-timer-wrap">
          <TomatoMascot className="tomato-hero" />
          <span className="tomato-time-display">{formatDuration(remainingSeconds)}</span>
        </div>
      </aside>
    </div>
  )
}

function CalendarRibbon({
  month,
  onPrevious,
  onNext,
  onJump,
  onHelp,
}: {
  month: Date
  onPrevious: () => void
  onNext: () => void
  onJump: (month: Date) => void
  onHelp: () => void
}) {
  const [isJumpOpen, setIsJumpOpen] = useState(false)
  const [jumpYear, setJumpYear] = useState(month.getFullYear())
  const monthChoices = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date(jumpYear, index, 1)),
    [jumpYear],
  )

  useEffect(() => {
    setJumpYear(month.getFullYear())
  }, [month])

  return (
    <div className="calendar-ribbon-content">
      <button
        type="button"
        className="calendar-year-button"
        onClick={() => setIsJumpOpen((current) => !current)}
        aria-label="Jump to month and year"
      >
        {format(month, 'yyyy')}
      </button>
      <div className="calendar-month-line">
        <button type="button" onClick={onPrevious} aria-label="Previous month">
          <ChevronLeft aria-hidden="true" />
        </button>
        <h1>
          <button
            type="button"
            className="calendar-month-trigger"
            onClick={() => setIsJumpOpen((current) => !current)}
            aria-label="Jump to month and year"
          >
            {format(month, 'MMMM')}
          </button>
        </h1>
        <button type="button" onClick={onNext} aria-label="Next month">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <AnimatePresence>
        {isJumpOpen ? (
          <motion.div
            className="calendar-jump-popover"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="jump-year-row">
              <button
                type="button"
                onClick={() => setJumpYear((year) => year - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <input
                type="number"
                value={jumpYear}
                onChange={(event) => setJumpYear(Number(event.target.value) || jumpYear)}
                aria-label="Calendar year"
              />
              <button
                type="button"
                onClick={() => setJumpYear((year) => year + 1)}
                aria-label="Next year"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <div className="jump-month-grid">
              {monthChoices.map((choice) => (
                <button
                  type="button"
                  key={choice.toISOString()}
                  className={
                    choice.getMonth() === month.getMonth() &&
                    choice.getFullYear() === month.getFullYear()
                      ? 'active'
                      : ''
                  }
                  onClick={() => {
                    onJump(choice)
                    setIsJumpOpen(false)
                  }}
                >
                  {format(choice, 'MMM')}
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <button
        type="button"
        className="help-button"
        onClick={onHelp}
        aria-label="Calendar help"
      >
        <HelpCircle aria-hidden="true" />
      </button>
    </div>
  )
}

function CalendarView({
  events,
  month,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
}: {
  events: CalendarEvent[]
  month: Date
  onAddEvent: (draft: CalendarEventDraft) => void
  onUpdateEvent: (draft: CalendarEventDraft) => void
  onDeleteEvent: (eventId: number) => void
}) {
  const [draft, setDraft] = useState<CalendarEventDraft | null>(null)

  const days = useMemo(() => {
    const firstDay = startOfMonth(month)
    const lastDay = endOfMonth(month)

    return eachDayOfInterval({
      start: startOfWeek(firstDay, { weekStartsOn: 1 }),
      end: endOfWeek(lastDay, { weekStartsOn: 1 }),
    })
  }, [month])
  const todayKey = dateKey(new Date())

  const openNewPlan = (day: Date) => {
    setDraft({
      date: dateKey(day),
      time: '09:00',
      title: '',
      location: '',
    })
  }

  const openEditPlan = (event: CalendarEvent) => {
    setDraft({
      id: event.id,
      date: event.date,
      time: event.time,
      title: event.title,
      location: event.location,
    })
  }

  const savePlan = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!draft) {
      return
    }

    if (draft.id) {
      onUpdateEvent(draft)
    } else {
      onAddEvent(draft)
    }

    setDraft(null)
  }

  return (
    <section className="calendar-board" aria-label="Monthly calendar">
      <div className="weekdays" aria-hidden="true">
        {['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        className="calendar-grid"
        style={{ '--calendar-weeks': Math.ceil(days.length / 7) } as CSSProperties}
      >
        {days.map((day) => {
          const key = dateKey(day)
          const inCurrentMonth = isSameMonth(day, month)
          const isToday = key === todayKey
          const dayEvents = events
            .filter((event) => event.date === key)
            .sort((first, second) => first.time.localeCompare(second.time))
          const visibleEvents = dayEvents.slice(0, 3)
          const hiddenEventCount = Math.max(0, dayEvents.length - visibleEvents.length)

          return (
            <div
              key={day.toISOString()}
              className={`day-cell ${inCurrentMonth ? '' : 'muted'} ${isToday ? 'today' : ''}`}
              role={inCurrentMonth ? 'button' : undefined}
              tabIndex={inCurrentMonth ? 0 : -1}
              aria-disabled={!inCurrentMonth}
              onClick={inCurrentMonth ? () => openNewPlan(day) : undefined}
              onKeyDown={(event) => {
                if (inCurrentMonth && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault()
                  openNewPlan(day)
                }
              }}
            >
              <span className="day-number">{format(day, 'd')}</span>
              <div className="day-events">
                {visibleEvents.map((event) => (
                  <button
                    type="button"
                    key={event.id}
                    className={`event-dot ${event.tone}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      openEditPlan(event)
                    }}
                  >
                    <span className="event-time">{event.time}</span>
                    <span className="event-title">{event.title}</span>
                  </button>
                ))}
                {hiddenEventCount > 0 ? (
                  <span className="event-more">{hiddenEventCount}+</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {draft ? (
          <motion.aside
            className="plan-editor"
            initial={{ opacity: 0, scale: 0.92, x: 28, rotate: 1 }}
            animate={{ opacity: 1, scale: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: 18 }}
            transition={{ type: 'spring', stiffness: 170, damping: 18 }}
          >
            <form onSubmit={savePlan}>
              <div className="plan-editor-top">
                <strong>{draft.id ? 'Edit plan' : 'New plan'}</strong>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  aria-label="Close plan editor"
                >
                  <X aria-hidden="true" />
                </button>
              </div>

              <label>
                date
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, date: event.target.value } : current,
                    )
                  }
                />
              </label>

              <label>
                time
                <input
                  type="time"
                  value={draft.time}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, time: event.target.value } : current,
                    )
                  }
                />
              </label>

              <label>
                title
                <input
                  value={draft.title}
                  placeholder="Astra plan title..."
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, title: event.target.value } : current,
                    )
                  }
                />
              </label>

              <label>
                location
                <input
                  value={draft.location}
                  placeholder="where?"
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, location: event.target.value } : current,
                    )
                  }
                />
              </label>

              <div className="plan-actions">
                <button type="submit" className="save-plan-button">
                  <Save aria-hidden="true" />
                  save
                </button>
                {draft.id ? (
                  <button
                    type="button"
                    className="delete-plan-button"
                    onClick={() => {
                      onDeleteEvent(draft.id ?? 0)
                      setDraft(null)
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    delete
                  </button>
                ) : null}
              </div>
            </form>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </section>
  )
}

function NotebookView({
  notes,
  onAddNote,
  onUpdateNote,
}: {
  notes: Note[]
  onAddNote: (note: Note) => void
  onUpdateNote: (noteId: number, updates: Partial<Omit<Note, 'id'>>) => void
}) {
  const [isCoverClosed, setIsCoverClosed] = useState(true)
  const [spreadStart, setSpreadStart] = useState(0)
  const [cover, setCover] = useState<NotebookCover>({
    title: 'AstraCosmeris notes',
    color: '#f6b4ad',
    stickers: [
      { id: 1, emoji: '⭐', x: 34, y: 24, size: 42 },
      { id: 2, emoji: '🍅', x: 66, y: 64, size: 46 },
    ],
  })
  const [contextMenu, setContextMenu] = useState<NotebookContextMenu>(null)
  const [customizer, setCustomizer] = useState<NotebookCustomizer>(null)
  const [placingEmoji, setPlacingEmoji] = useState('⭐')
  const [placingStickerSize, setPlacingStickerSize] = useState(44)
  const [selectedStickerId, setSelectedStickerId] = useState<number | null>(null)
  const [flip, setFlip] = useState<NotebookFlip>(null)
  const [turningPage, setTurningPage] = useState<NotebookTurningPage>(null)
  const [pageTurnMs, setPageTurnMs] = useState(NOTEBOOK_TURN_DURATION_MS)
  const [isPageTraveling, setIsPageTraveling] = useState(false)
  const spreadStartRef = useRef(spreadStart)
  const ensuredPageCountRef = useRef(notes.length)
  const turnTimerRef = useRef<number | null>(null)
  const turnFinishTimerRef = useRef<number | null>(null)
  const travelPauseTimerRef = useRef<number | null>(null)
  const leftPageIndex = spreadStart
  const rightPageIndex = spreadStart + 1
  const leftNote = notes[leftPageIndex] ?? createBlankNotebookPage(leftPageIndex)
  const rightNote = notes[rightPageIndex] ?? createBlankNotebookPage(rightPageIndex)
  const leftUnderNote =
    flip?.side === 'left' && flip.kind === 'turn' && spreadStart > 0
      ? notes[spreadStart - 2] ?? createBlankNotebookPage(spreadStart - 2)
      : null
  const rightUnderNote =
    flip?.side === 'right' && flip.kind === 'turn'
      ? notes[spreadStart + 3] ?? createBlankNotebookPage(spreadStart + 3)
      : null

  const ensurePageCount = useCallback((pageCount: number) => {
    if (ensuredPageCountRef.current >= pageCount) {
      return
    }

    for (
      let pageIndex = ensuredPageCountRef.current;
      pageIndex < pageCount;
      pageIndex += 1
    ) {
      onAddNote(createBlankNotebookPage(pageIndex))
    }

    ensuredPageCountRef.current = pageCount
  }, [onAddNote])

  const clearPageTravelTimers = () => {
    if (turnTimerRef.current !== null) {
      window.clearTimeout(turnTimerRef.current)
      turnTimerRef.current = null
    }

    if (turnFinishTimerRef.current !== null) {
      window.clearTimeout(turnFinishTimerRef.current)
      turnFinishTimerRef.current = null
    }

    if (travelPauseTimerRef.current !== null) {
      window.clearTimeout(travelPauseTimerRef.current)
      travelPauseTimerRef.current = null
    }
  }

  const stopPageTravel = () => {
    clearPageTravelTimers()
    setIsPageTraveling(false)
    setTurningPage(null)
    setFlip(null)
  }

  const getTurningPage = (side: 'left' | 'right', currentSpread: number) => {
    const pageIndex = side === 'left' ? currentSpread : currentSpread + 1

    return {
      side,
      note: notes[pageIndex] ?? createBlankNotebookPage(pageIndex),
      pageNumber: pageIndex + 1,
    }
  }

  const scheduleSpreadTurn = ({
    duration,
    nextSpread,
    onComplete,
    side,
  }: {
    duration: number
    nextSpread: number
    onComplete?: () => void
    side: 'left' | 'right'
  }) => {
    const currentSpread = spreadStartRef.current
    const midpointMs = Math.max(140, duration * 0.42)

    setPageTurnMs(duration)
    setTurningPage(getTurningPage(side, currentSpread))
    setFlip({ side, kind: 'turn' })

    turnTimerRef.current = window.setTimeout(() => {
      setSpreadStart(nextSpread)
      spreadStartRef.current = nextSpread
      setFlip(null)
    }, midpointMs)

    turnFinishTimerRef.current = window.setTimeout(() => {
      setTurningPage(null)
      onComplete?.()
    }, duration)
  }

  useEffect(() => {
    spreadStartRef.current = spreadStart
  }, [spreadStart])

  useEffect(() => {
    ensuredPageCountRef.current = Math.max(ensuredPageCountRef.current, notes.length)
  }, [notes.length])

  useEffect(() => {
    ensurePageCount(rightPageIndex + 1)
  }, [ensurePageCount, rightPageIndex])

  useEffect(
    () => () => {
      clearPageTravelTimers()
    },
    [],
  )

  const ripPage = (note: Note, side: 'left' | 'right') => {
    stopPageTravel()
    setContextMenu(null)
    setCustomizer(null)
    setPageTurnMs(NOTEBOOK_RIP_DURATION_MS)
    setFlip({ side, kind: 'rip' })
    turnTimerRef.current = window.setTimeout(() => {
      onUpdateNote(note.id, { title: '', body: '', bookmarkEmoji: '' })
      setFlip(null)
    }, NOTEBOOK_RIP_DURATION_MS)
  }

  const closeToCover = () => {
    stopPageTravel()
    setContextMenu(null)
    setCustomizer(null)
    setPageTurnMs(NOTEBOOK_TURN_DURATION_MS)
    setFlip({ side: 'left', kind: 'turn' })
    turnTimerRef.current = window.setTimeout(() => {
      setIsCoverClosed(true)
      setFlip(null)
    }, NOTEBOOK_TURN_DURATION_MS)
  }

  const openCover = () => {
    stopPageTravel()
    setContextMenu(null)
    setCustomizer(null)
    setPageTurnMs(NOTEBOOK_TURN_DURATION_MS)
    setFlip({ side: 'cover', kind: 'turn' })
    turnTimerRef.current = window.setTimeout(() => {
      setIsCoverClosed(false)
      setSpreadStart(0)
      spreadStartRef.current = 0
      setFlip(null)
    }, NOTEBOOK_TURN_DURATION_MS)
  }

  const turnLeftPage = () => {
    stopPageTravel()
    setContextMenu(null)
    setCustomizer(null)
    if (spreadStart <= 0) {
      closeToCover()
      return
    }

    scheduleSpreadTurn({
      duration: NOTEBOOK_TURN_DURATION_MS,
      nextSpread: Math.max(0, spreadStart - 2),
      side: 'left',
    })
  }

  const turnRightPage = () => {
    stopPageTravel()
    setContextMenu(null)
    setCustomizer(null)
    ensurePageCount(spreadStart + 4)
    scheduleSpreadTurn({
      duration: NOTEBOOK_TURN_DURATION_MS,
      nextSpread: spreadStart + 2,
      side: 'right',
    })
  }

  const getBookmarkTravelTurnDuration = (turnCount: number) =>
    Math.max(
      NOTEBOOK_TRAVEL_TURN_MIN_MS,
      Math.min(NOTEBOOK_TRAVEL_TURN_MAX_MS, 760 - turnCount * 12),
    )

  const jumpToPage = (pageIndex: number) => {
    const targetSpread = Math.max(0, Math.floor(pageIndex / 2) * 2)
    const startingSpread = spreadStartRef.current

    setIsCoverClosed(false)
    setContextMenu(null)
    setCustomizer(null)
    clearPageTravelTimers()

    if (targetSpread === startingSpread) {
      setIsPageTraveling(false)
      setFlip(null)
      setTurningPage(null)
      return
    }

    const direction = targetSpread > startingSpread ? 1 : -1
    const totalTurns = Math.abs(targetSpread - startingSpread) / 2
    const turnDuration = getBookmarkTravelTurnDuration(totalTurns)
    const turnPause = Math.max(28, Math.min(80, turnDuration * 0.14))

    ensurePageCount(Math.max(targetSpread + 2, startingSpread + 4))
    setPageTurnMs(turnDuration)
    setIsPageTraveling(true)

    const turnStep = () => {
      const currentSpread = spreadStartRef.current
      const reachedTarget =
        direction > 0 ? currentSpread >= targetSpread : currentSpread <= targetSpread

      if (reachedTarget) {
        setIsPageTraveling(false)
        setFlip(null)
        return
      }

      const nextSpread = Math.max(0, currentSpread + direction * 2)
      if (direction > 0) {
        ensurePageCount(currentSpread + 4)
      }

      scheduleSpreadTurn({
        duration: turnDuration,
        nextSpread,
        side: direction > 0 ? 'right' : 'left',
        onComplete: () => {
          const finished =
            direction > 0 ? nextSpread >= targetSpread : nextSpread <= targetSpread

          if (finished) {
            setIsPageTraveling(false)
            return
          }

          travelPauseTimerRef.current = window.setTimeout(turnStep, turnPause)
        },
      })
    }

    turnStep()
  }

  const openNotebookContext = (
    event: MouseEvent<HTMLElement>,
    menu: Exclude<NotebookContextMenu, null>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    const spreadElement = event.currentTarget.closest('.notebook-spread')
    const spreadRect = spreadElement?.getBoundingClientRect()
    const localX = spreadRect ? event.clientX - spreadRect.left : event.clientX
    const localY = spreadRect ? event.clientY - spreadRect.top : event.clientY
    const menuWidth = menu.type === 'bookmark' ? 360 : 340
    const menuHeight = 250

    setContextMenu({
      ...menu,
      x: spreadRect
        ? Math.min(Math.max(8, localX), Math.max(8, spreadRect.width - menuWidth))
        : localX,
      y: spreadRect
        ? Math.min(Math.max(8, localY), Math.max(8, spreadRect.height - menuHeight))
        : localY,
    })
    setCustomizer(null)
  }

  const addCoverSticker = (event: MouseEvent<HTMLElement>) => {
    if (customizer?.type !== 'cover' || !placingEmoji.trim()) {
      return
    }

    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    const nextStickerId = Date.now()

    setCover((current) => ({
      ...current,
      stickers: [
        ...current.stickers,
        {
          id: nextStickerId,
          emoji: placingEmoji.trim().slice(0, 4),
          x: Math.min(94, Math.max(6, x)),
          y: Math.min(92, Math.max(8, y)),
          size: placingStickerSize,
        },
      ],
    }))
    setSelectedStickerId(nextStickerId)
  }

  const moveCoverSticker = (stickerId: number, x: number, y: number) => {
    setSelectedStickerId(stickerId)
    setCover((current) => ({
      ...current,
      stickers: current.stickers.map((sticker) =>
        sticker.id === stickerId
          ? {
              ...sticker,
              x: Math.min(96, Math.max(4, x)),
              y: Math.min(94, Math.max(6, y)),
            }
          : sticker,
      ),
    }))
  }

  const changeStickerSize = (size: number) => {
    setPlacingStickerSize(size)
    if (selectedStickerId === null) {
      return
    }

    setCover((current) => ({
      ...current,
      stickers: current.stickers.map((sticker) =>
        sticker.id === selectedStickerId ? { ...sticker, size } : sticker,
      ),
    }))
  }

  return (
    <section
      className="notebook-layout"
      onClick={() => {
        setContextMenu(null)
      }}
    >
      <div
        className={`notebook-spread ${isCoverClosed ? 'cover-mode' : ''} ${
          isPageTraveling ? 'is-page-traveling' : ''
        }`}
        style={{ '--page-turn-duration': `${pageTurnMs}ms` } as CSSProperties}
      >
        {isCoverClosed ? (
          <NotebookCoverPage
            cover={cover}
            customizer={customizer}
            placingEmoji={placingEmoji}
            isFlipping={flip?.side === 'cover'}
            onChange={setCover}
            onNext={openCover}
            onPlaceEmoji={addCoverSticker}
            onMoveSticker={moveCoverSticker}
            onSelectSticker={setSelectedStickerId}
            onContextMenu={(event) =>
              openNotebookContext(event, {
                type: 'cover',
                x: event.clientX,
                y: event.clientY,
              })
            }
          />
        ) : (
          <>
            <div className="notebook-pages">
              {leftUnderNote ? (
                <NotebookUnderPage
                  note={leftUnderNote}
                  side="left"
                  pageNumber={spreadStart - 1}
                />
              ) : null}
              <NotebookEditablePage
                note={leftNote}
                side="left"
                pageNumber={leftPageIndex + 1}
                isFlipping={flip?.side === 'left' && !turningPage}
                flipKind={flip?.side === 'left' ? flip.kind : undefined}
                canTurnPrevious
                onTurnPrevious={turnLeftPage}
                onRipPage={ripPage}
                onUpdateNote={onUpdateNote}
              />

              <SpringSpine />

              {rightUnderNote ? (
                <NotebookUnderPage
                  note={rightUnderNote}
                  side="right"
                  pageNumber={spreadStart + 4}
                />
              ) : null}
              <NotebookEditablePage
                note={rightNote}
                side="right"
                pageNumber={rightPageIndex + 1}
                isFlipping={flip?.side === 'right' && !turningPage}
                flipKind={flip?.side === 'right' ? flip.kind : undefined}
                canTurnNext
                onTurnNext={turnRightPage}
                onRipPage={ripPage}
                onUpdateNote={onUpdateNote}
              />

              {turningPage ? (
                <NotebookTurningPageOverlay turningPage={turningPage} />
              ) : null}
            </div>

            <NotebookBookmarks
              notes={notes}
              spreadStart={spreadStart}
              onSelectPage={jumpToPage}
              onContextMenu={(event, noteId) =>
                openNotebookContext(event, {
                  type: 'bookmark',
                  noteId,
                  x: event.clientX,
                  y: event.clientY,
                })
              }
            />
          </>
        )}

        <NotebookContextAction
          menu={contextMenu}
          onCustomize={(menu) => {
            setContextMenu(null)
            setCustomizer(menu)
          }}
        />
        <NotebookCustomizerPanel
          customizer={customizer}
          notes={notes}
          cover={cover}
          placingEmoji={placingEmoji}
          placingStickerSize={placingStickerSize}
          onClose={() => setCustomizer(null)}
          onCoverChange={setCover}
          onNoteChange={onUpdateNote}
          onPlacingEmojiChange={setPlacingEmoji}
          onStickerSizeChange={changeStickerSize}
        />
      </div>
    </section>
  )
}

function NotebookCoverPage({
  cover,
  customizer,
  placingEmoji,
  isFlipping,
  onChange,
  onNext,
  onPlaceEmoji,
  onMoveSticker,
  onSelectSticker,
  onContextMenu,
}: {
  cover: NotebookCover
  customizer: NotebookCustomizer
  placingEmoji: string
  isFlipping: boolean
  onChange: Dispatch<SetStateAction<NotebookCover>>
  onNext: () => void
  onPlaceEmoji: (event: MouseEvent<HTMLElement>) => void
  onMoveSticker: (stickerId: number, x: number, y: number) => void
  onSelectSticker: Dispatch<SetStateAction<number | null>>
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
}) {
  return (
    <article
      className={`notebook-page notebook-cover ${isFlipping ? 'is-flipping-cover' : ''}`}
      style={{ '--cover-color': cover.color } as CSSProperties}
      onContextMenu={onContextMenu}
    >
      <div className="cover-inner" onClick={onPlaceEmoji}>
        <BookOpen aria-hidden="true" />
        <input
          value={cover.title}
          onChange={(event) =>
            onChange((current) => ({ ...current, title: event.target.value }))
          }
          aria-label="Notebook cover title"
        />
        <div className="cover-stickers" aria-label="Notebook cover stickers">
          {cover.stickers.map((sticker) => (
            <button
              type="button"
              key={sticker.id}
              className="cover-sticker"
              style={
                {
                  '--sticker-x': `${sticker.x}%`,
                  '--sticker-y': `${sticker.y}%`,
                  '--sticker-size': `${sticker.size}px`,
                } as CSSProperties
              }
              onPointerDown={(event) => {
                event.stopPropagation()
                onSelectSticker(sticker.id)
                if (customizer?.type === 'cover') {
                  event.currentTarget.setPointerCapture(event.pointerId)
                }
              }}
              onPointerMove={(event) => {
                if (customizer?.type !== 'cover' || event.buttons !== 1) {
                  return
                }

                const coverInner = event.currentTarget.closest('.cover-inner')
                if (!(coverInner instanceof HTMLElement)) {
                  return
                }

                const rect = coverInner.getBoundingClientRect()
                onMoveSticker(
                  sticker.id,
                  ((event.clientX - rect.left) / rect.width) * 100,
                  ((event.clientY - rect.top) / rect.height) * 100,
                )
              }}
              onClick={(event) => event.stopPropagation()}
              data-tip={customizer?.type === 'cover' ? 'Drag sticker' : undefined}
            >
              {sticker.emoji}
            </button>
          ))}
          {customizer?.type === 'cover' ? (
            <span
              className="cover-placement-hint"
              style={{ '--preview-emoji': `"${placingEmoji}"` } as CSSProperties}
            >
              click cover to place {placingEmoji}
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="page-curl page-curl-turn page-curl-right"
        onClick={onNext}
        data-tip="Turn cover"
        aria-label="Turn from cover to first page"
      />
    </article>
  )
}

function NotebookUnderPage({
  note,
  side,
  pageNumber,
}: {
  note: Note
  side: 'left' | 'right'
  pageNumber: number
}) {
  return (
    <article
      className={`notebook-page notebook-underpage notebook-underpage-${side} notebook-page-${side}`}
      aria-hidden="true"
    >
      <div className="note-editor-top">
        <div>
          <span>page {pageNumber}</span>
          <strong>{note.title.trim()}</strong>
        </div>
      </div>
      <div className="notebook-underpage-body">
        {note.body.trim() ? note.body : ''}
      </div>
      <div className="notebook-page-footer">
        <span>{note.due}</span>
      </div>
    </article>
  )
}

function NotebookTurningPageOverlay({
  turningPage,
}: {
  turningPage: Exclude<NotebookTurningPage, null>
}) {
  return (
    <article
      className={`notebook-page notebook-turning-page notebook-page-${turningPage.side} is-flipping-turn`}
      aria-hidden="true"
    >
      <div className="note-editor-top">
        <div>
          <span>page {turningPage.pageNumber}</span>
          <strong>{turningPage.note.title.trim()}</strong>
        </div>
      </div>
      <div className="notebook-turning-page-body">
        {turningPage.note.body.trim() ? turningPage.note.body : ''}
      </div>
      <div className="notebook-page-footer">
        <span>{turningPage.note.due}</span>
      </div>
    </article>
  )
}

function NotebookEditablePage({
  note,
  side,
  pageNumber,
  isFlipping,
  flipKind,
  canTurnPrevious = false,
  canTurnNext = false,
  onTurnPrevious,
  onTurnNext,
  onRipPage,
  onUpdateNote,
}: {
  note?: Note | null
  side: 'left' | 'right'
  pageNumber: number
  isFlipping: boolean
  flipKind?: 'turn' | 'rip'
  canTurnPrevious?: boolean
  canTurnNext?: boolean
  onTurnPrevious?: () => void
  onTurnNext?: () => void
  onRipPage: (note: Note, side: 'left' | 'right') => void
  onUpdateNote: (noteId: number, updates: Partial<Omit<Note, 'id'>>) => void
}) {
  if (!note) {
    return (
      <article className={`notebook-page notebook-page-${side} notebook-page-blank`}>
        <span>page {pageNumber}</span>
      </article>
    )
  }

  return (
    <article
      className={`notebook-page notebook-page-${side} ${
        isFlipping ? `is-flipping-${side} is-flipping-${flipKind ?? 'turn'}` : ''
      }`}
    >
      <div className="note-editor-top">
        <div>
          <span>page {pageNumber}</span>
          <input
            value={note.title}
            onChange={(event) => onUpdateNote(note.id, { title: event.target.value })}
            aria-label={`Notebook page ${pageNumber} title`}
          />
        </div>
      </div>

      <textarea
        value={note.body}
        onChange={(event) => onUpdateNote(note.id, { body: event.target.value })}
        aria-label={`Notebook page ${pageNumber} body`}
        placeholder="write softly here..."
      />

      <div className="notebook-page-footer">
        <span>{note.due}</span>
      </div>

      <button
        type="button"
        className={`page-curl page-curl-rip page-curl-${side}`}
        onClick={() => onRipPage(note, side)}
        data-tip="Clear page"
        aria-label={`Clear page ${pageNumber}`}
      />

      {canTurnPrevious ? (
        <button
          type="button"
          className="page-curl page-curl-turn page-curl-left"
          onClick={onTurnPrevious}
          data-tip="Turn page"
          aria-label="Turn to previous pages"
        />
      ) : null}
      {canTurnNext ? (
        <button
          type="button"
          className="page-curl page-curl-turn page-curl-right"
          onClick={onTurnNext}
          data-tip="Turn page"
          aria-label="Turn to next pages"
        />
      ) : null}
    </article>
  )
}

function NotebookBookmarks({
  notes,
  spreadStart,
  onSelectPage,
  onContextMenu,
}: {
  notes: Note[]
  spreadStart: number
  onSelectPage: (pageIndex: number) => void
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, noteId: number) => void
}) {
  const expandedCount = 5
  const compactCount = 7
  const rightPageIndex = spreadStart + 1
  const [expandedSide, setExpandedSide] = useState<'left' | 'right' | null>(null)
  const [bookmarkOffsets, setBookmarkOffsets] = useState({ left: 0, right: 0 })
  const [hoveredBookmarkId, setHoveredBookmarkId] = useState<number | null>(null)
  const bookmarkedNotes = notes
    .map((note, index) => {
      const side: 'left' | 'right' =
        index < spreadStart
          ? 'left'
          : index > rightPageIndex
            ? 'right'
            : index % 2 === 0
              ? 'left'
              : 'right'
      const layer =
        index < spreadStart
          ? 'before'
          : index > rightPageIndex
            ? 'after'
            : 'top'
      const spreadDistance =
        index < spreadStart
          ? Math.ceil((spreadStart - index) / 2)
          : index > rightPageIndex
            ? Math.ceil((index - rightPageIndex) / 2)
            : 0

      return {
        active: index === spreadStart || index === rightPageIndex,
        index,
        note,
        pageNumber: index + 1,
        side,
        layer,
        spreadDistance,
        title: getBookmarkTitle(note, index + 1),
      }
    })
    .filter(({ note }) => hasNoteContent(note))

  const sideItems = {
    left: bookmarkedNotes
      .filter((bookmark) => bookmark.side === 'left')
      .sort((a, b) => b.index - a.index),
    right: bookmarkedNotes
      .filter((bookmark) => bookmark.side === 'right')
      .sort((a, b) => a.index - b.index),
  }

  useEffect(() => {
    setBookmarkOffsets((current) => ({
      left: Math.min(current.left, Math.max(0, sideItems.left.length - expandedCount)),
      right: Math.min(current.right, Math.max(0, sideItems.right.length - expandedCount)),
    }))
  }, [sideItems.left.length, sideItems.right.length])

  useEffect(() => {
    setBookmarkOffsets({ left: 0, right: 0 })
    setExpandedSide(null)
    setHoveredBookmarkId(null)
  }, [spreadStart])

  const handleBookmarkWheel = (
    event: WheelEvent<HTMLElement>,
    side: 'left' | 'right',
    itemCount: number,
  ) => {
    if (itemCount <= expandedCount) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const direction = event.deltaY > 0 ? 1 : -1
    const maxOffset = Math.max(0, itemCount - expandedCount)
    setBookmarkOffsets((current) => ({
      ...current,
      [side]: Math.min(maxOffset, Math.max(0, current[side] + direction)),
    }))
  }

  const closeExpandedBookmarks = () => {
    setExpandedSide(null)
    setHoveredBookmarkId(null)
  }

  const handleBookmarkBlur = (event: FocusEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return
    }

    closeExpandedBookmarks()
  }

  const renderSide = (side: 'left' | 'right') => {
    const items = sideItems[side]
    if (!items.length) {
      return null
    }

    const expanded = expandedSide === side
    const maxOffset = Math.max(0, items.length - expandedCount)
    const offset = Math.min(bookmarkOffsets[side], maxOffset)
    const visibleItems = expanded
      ? items.slice(offset, offset + compactCount)
      : items.slice(0, compactCount)
    const hoveredIndex = visibleItems.findIndex(
      (bookmark) => bookmark.note.id === hoveredBookmarkId,
    )

    return (
      <aside
        className={`notebook-bookmarks notebook-bookmarks-${side} ${
          expanded ? 'expanded' : 'compact'
        } ${hoveredBookmarkId !== null ? 'has-hover' : ''}`}
        aria-label={`${side} notebook bookmarks`}
        onMouseEnter={() => setExpandedSide(side)}
        onPointerEnter={() => setExpandedSide(side)}
        onFocus={() => setExpandedSide(side)}
        onBlur={handleBookmarkBlur}
        onMouseLeave={closeExpandedBookmarks}
        onPointerLeave={closeExpandedBookmarks}
        onWheel={(event) => handleBookmarkWheel(event, side, items.length)}
      >
        {visibleItems.map((bookmark, visibleIndex) => {
          const focusDistance =
            hoveredIndex >= 0 ? Math.abs(visibleIndex - hoveredIndex) : 0
          const compactAlpha = Math.max(
            0,
            1 - bookmark.spreadDistance * 0.08 - visibleIndex * 0.16,
          )
          const focusAlpha =
            expanded && hoveredIndex >= 0
              ? Math.max(0.28, 1 - focusDistance * 0.18)
              : 1
          const stackDepth = expanded ? visibleIndex : bookmark.spreadDistance
          const layerZ =
            bookmark.layer === 'top' ? 42 : Math.max(8, 18 - visibleIndex)

          return (
            <button
              type="button"
              key={bookmark.note.id}
              className={`notebook-bookmark notebook-bookmark-${side} ${
                bookmark.active ? 'active' : ''
              } ${bookmark.layer}-layer`}
              style={
                {
                  '--bookmark-alpha': compactAlpha,
                  '--bookmark-tucked-alpha': Math.max(0.18, compactAlpha * 0.7),
                  '--bookmark-color': bookmark.note.bookmarkColor,
                  '--bookmark-focus-alpha': focusAlpha,
                  '--bookmark-stack-index': visibleIndex,
                  '--bookmark-depth': stackDepth,
                  '--bookmark-z': Math.max(1, 120 - visibleIndex),
                  '--bookmark-layer-z': layerZ,
                } as CSSProperties
              }
              onClick={() => onSelectPage(bookmark.index)}
              onContextMenu={(event) => onContextMenu(event, bookmark.note.id)}
              onMouseEnter={() => setHoveredBookmarkId(bookmark.note.id)}
              onMouseLeave={() => setHoveredBookmarkId(null)}
              data-tip="Right-click: customize"
              data-layer={bookmark.layer}
              data-page={bookmark.pageNumber}
              title="Right-click to customize bookmark"
              aria-current={bookmark.active ? 'page' : undefined}
              aria-label={`Open page ${bookmark.pageNumber}: ${bookmark.title}`}
            >
              <span className="bookmark-pin" aria-hidden="true" />
              <span className="bookmark-badge">
                {bookmark.note.bookmarkEmoji.trim() || bookmark.pageNumber}
              </span>
              <span className="bookmark-copy">
                <strong>{bookmark.title}</strong>
                <span className="bookmark-page-label">page {bookmark.pageNumber}</span>
              </span>
            </button>
          )
        })}
      </aside>
    )
  }

  return (
    <>
      {renderSide('left')}
      {renderSide('right')}
    </>
  )
}

function NotebookContextAction({
  menu,
  onCustomize,
}: {
  menu: NotebookContextMenu
  onCustomize: (menu: Exclude<NotebookContextMenu, null>) => void
}) {
  if (!menu) {
    return null
  }

  return (
    <motion.div
      className="notebook-context-action"
      style={{ left: menu.x, top: menu.y }}
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" onClick={() => onCustomize(menu)}>
        {menu.type === 'cover' ? 'Customize Cover' : 'Customize Bookmark'}
      </button>
    </motion.div>
  )
}

function NotebookCustomizerPanel({
  customizer,
  notes,
  cover,
  placingEmoji,
  placingStickerSize,
  onClose,
  onCoverChange,
  onNoteChange,
  onPlacingEmojiChange,
  onStickerSizeChange,
}: {
  customizer: NotebookCustomizer
  notes: Note[]
  cover: NotebookCover
  placingEmoji: string
  placingStickerSize: number
  onClose: () => void
  onCoverChange: Dispatch<SetStateAction<NotebookCover>>
  onNoteChange: (noteId: number, updates: Partial<Omit<Note, 'id'>>) => void
  onPlacingEmojiChange: (emoji: string) => void
  onStickerSizeChange: (size: number) => void
}) {
  if (!customizer) {
    return null
  }

  const selectedNote =
    customizer.type === 'bookmark'
      ? notes.find((note) => note.id === customizer.noteId)
      : null

  return (
    <motion.aside
      className={`notebook-customizer customizer-${customizer.type}`}
      style={{ left: customizer.x, top: customizer.y }}
      initial={{ opacity: 0, scale: 0.92, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="customizer-top">
        <strong>
          {customizer.type === 'cover' ? 'cover magic' : 'bookmark magic'}
        </strong>
        <button type="button" onClick={onClose} aria-label="Close customizer">
          <X aria-hidden="true" />
        </button>
      </div>

      {customizer.type === 'cover' ? (
        <>
          <AstraColorPicker
            value={cover.color}
            onChange={(color) =>
              onCoverChange((current) => ({ ...current, color }))
            }
          />
          <label className="emoji-field">
            emoji
            <input
              value={placingEmoji}
              onChange={(event) => onPlacingEmojiChange(event.target.value)}
              aria-label="Cover emoji to place"
            />
          </label>
          <label className="size-field">
            sticker size
            <input
              type="range"
              min="26"
              max="94"
              value={placingStickerSize}
              onChange={(event) => onStickerSizeChange(Number(event.target.value))}
              aria-label="Sticker size"
            />
            <span>{placingStickerSize}px</span>
          </label>
          <div className="emoji-presets">
            {['⭐', '🍅', '🌙', '✨', '💗', '📌'].map((emoji) => (
              <button
                type="button"
                key={emoji}
                onClick={() => onPlacingEmojiChange(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <p>click the cover to place it</p>
        </>
      ) : selectedNote ? (
        <>
          <AstraColorPicker
            value={selectedNote.bookmarkColor}
            onChange={(color) => onNoteChange(selectedNote.id, { bookmarkColor: color })}
          />
          <label className="emoji-field">
            emoji
            <input
              value={selectedNote.bookmarkEmoji}
              onChange={(event) =>
                onNoteChange(selectedNote.id, { bookmarkEmoji: event.target.value })
              }
              aria-label="Bookmark emoji"
            />
          </label>
        </>
      ) : null}
    </motion.aside>
  )
}

function AstraColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const colors = ['#f6b4ad', '#ffca4f', '#9fb5e2', '#87a0d5', '#35338b', '#ff432b']

  return (
    <div className="astra-color-picker">
      <div className="color-wheel" style={{ '--picked-color': value } as CSSProperties}>
        {colors.map((color, index) => {
          const angle = index * (360 / colors.length) - 90
          const radians = (angle * Math.PI) / 180

          return (
            <button
              type="button"
              key={color}
              className={color.toLowerCase() === value.toLowerCase() ? 'active' : ''}
              style={
                {
                  '--swatch-color': color,
                  '--swatch-x': `${Math.cos(radians) * 42}px`,
                  '--swatch-y': `${Math.sin(radians) * 42}px`,
                } as CSSProperties
              }
              onClick={() => onChange(color)}
              aria-label={`Choose ${color}`}
            />
          )
        })}
        <label className="color-wheel-core">
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label="Custom color"
          />
        </label>
      </div>
    </div>
  )
}

function SpringSpine() {
  return (
    <div className="spring-spine" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  )
}

function PomodoroView({
  pomodoro,
  setPomodoro,
  onStartFocus,
}: {
  pomodoro: { work: number; break: number; running: boolean }
  setPomodoro: Dispatch<
    SetStateAction<{ work: number; break: number; running: boolean }>
  >
  onStartFocus: () => void
}) {
  const updateMinutes = (key: 'work' | 'break', direction: 1 | -1) => {
    setPomodoro((current) => ({
      ...current,
      [key]: Math.max(1, current[key] + direction),
    }))
  }

  return (
    <section className="pomodoro-panel">
      <motion.div
        className="pomodoro-title"
        initial={{ scale: 0.92 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14 }}
      >
        <TomatoMascot small />
        <h1>POMODORO</h1>
      </motion.div>

      <div className="pomodoro-controls">
        <MinuteStepper
          label="working session"
          value={pomodoro.work}
          onIncrease={() => updateMinutes('work', 1)}
          onDecrease={() => updateMinutes('work', -1)}
        />
        <MinuteStepper
          label="breaktime"
          value={pomodoro.break}
          onIncrease={() => updateMinutes('break', 1)}
          onDecrease={() => updateMinutes('break', -1)}
        />
      </div>

      <div className="pomodoro-actions">
        <button
          type="button"
          className="start-button"
          onClick={() => {
            setPomodoro((current) => ({ ...current, running: true }))
            onStartFocus()
          }}
        >
          <Play aria-hidden="true" />
          START
        </button>
        <button
          type="button"
          className="reset-button"
          onClick={() => setPomodoro({ work: 25, break: 5, running: false })}
          aria-label="Reset Pomodoro"
        >
          <RotateCcw aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}

function MinuteStepper({
  label,
  value,
  onIncrease,
  onDecrease,
}: {
  label: string
  value: number
  onIncrease: () => void
  onDecrease: () => void
}) {
  return (
    <motion.div className="minute-stepper" whileHover={{ y: -4 }}>
      <span>{label}</span>
      <button type="button" onClick={onIncrease} aria-label={`Increase ${label}`}>
        <ChevronUp aria-hidden="true" />
      </button>
      <strong>{value}</strong>
      <button type="button" onClick={onDecrease} aria-label={`Decrease ${label}`}>
        <ChevronDown aria-hidden="true" />
      </button>
    </motion.div>
  )
}

function SmartraView({ onSelectView }: { onSelectView: (view: ViewName) => void }) {
  return (
    <section className="smartra-layout">
      <motion.div
        className="smartra-panel cream-panel"
        initial={{ x: -18, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
      >
        <div className="panel-heading">
          <Sparkles aria-hidden="true" />
          <h1>Smartra</h1>
        </div>
        <div className="smartra-search">
          <Search aria-hidden="true" />
          <span>ask Astra or run command...</span>
          <Command aria-hidden="true" />
        </div>
        <div className="smartra-suggestions">
          {commandItems.map((item) => (
            <button type="button" key={item.label} onClick={() => onSelectView(item.view)}>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.aside
        className="smartra-chat"
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <AstraHead compact />
        <p>
          Tell me what you need, and I will help route it into focus time, notes,
          or calendar plans.
        </p>
        <button type="button">
          <Send aria-hidden="true" />
          send
        </button>
      </motion.aside>
    </section>
  )
}

function CommandOverlay({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean
  onClose: () => void
  onSelect: (view: ViewName) => void
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="command-backdrop" onClick={onClose} role="presentation">
      <motion.div
        className="command-menu"
        initial={{ opacity: 0, scale: 0.96, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="command-input">
          <Search aria-hidden="true" />
          <input autoFocus placeholder="Smartra command..." aria-label="Smartra command" />
          <Command aria-hidden="true" />
        </div>
        <div className="command-results">
          {commandItems.map((item) => (
            <button type="button" key={item.label} onClick={() => onSelect(item.view)}>
              <span>{item.label}</span>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

function ContextWheel({
  position,
  isFocusRunning,
  onClose,
  onSelect,
}: {
  position: { x: number; y: number } | null
  isFocusRunning: boolean
  onClose: () => void
  onSelect: (view: ViewName) => void
}) {
  if (!position) {
    return null
  }

  const wheelItems = [
    { view: 'time' as ViewName, label: 'clock', Icon: Clock, angle: -90 },
    { view: 'calendar' as ViewName, label: 'calendar', Icon: CalendarDays, angle: -18 },
    { view: 'notebook' as ViewName, label: 'notes', Icon: BookOpen, angle: 54 },
    {
      view: (isFocusRunning ? 'focus' : 'pomodoro') as ViewName,
      label: isFocusRunning ? 'focus' : 'pomo',
      Icon: Play,
      angle: 126,
    },
    { view: 'smartra' as ViewName, label: 'Smartra', Icon: Sparkles, angle: 198 },
  ]

  return (
    <motion.div
      className="context-wheel"
      style={{ left: position.x, top: position.y }}
      initial={{ opacity: 0, scale: 0.76 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.86 }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="context-wheel-center"
        onClick={onClose}
        aria-label="Close quick wheel"
      >
        Astra
      </button>
      {wheelItems.map(({ view, label, Icon, angle }) => {
        const radius = 98
        const radians = (angle * Math.PI) / 180

        return (
          <button
            type="button"
            key={`${view}-${label}`}
            className="context-wheel-item"
            style={
              {
                '--wheel-x': `${Math.cos(radians) * radius}px`,
                '--wheel-y': `${Math.sin(radians) * radius}px`,
              } as CSSProperties
            }
            onClick={() => onSelect(view)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </motion.div>
  )
}

function GuidancePopover({
  title,
  body,
  onClose,
}: {
  title: string
  body: string
  onClose: () => void
}) {
  return (
    <motion.aside
      className="guidance-popover"
      initial={{ opacity: 0, y: -8, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
    >
      <button type="button" onClick={onClose} aria-label="Close help">
        <X aria-hidden="true" />
      </button>
      <strong>{title}</strong>
      <p>{body}</p>
    </motion.aside>
  )
}

function AstraCompanion({ onTomatoClick }: { onTomatoClick: () => void }) {
  return (
    <motion.figure
      className="astra-companion"
      aria-label="Astra companion"
    >
      <AstraPortrait />
      <button
        type="button"
        className="companion-tomato"
        onClick={onTomatoClick}
        aria-label="Open Pomodoro"
      >
        <img src={astraAssets.tomato} alt="" />
      </button>
    </motion.figure>
  )
}

function AstraPortrait() {
  return <img className="astra-portrait" src={astraAssets.sitting} alt="Astra" />
}

function AstraHead({ compact = false }: { compact?: boolean }) {
  return (
    <img
      className={`astra-head ${compact ? 'compact' : ''}`}
      src={compact ? astraAssets.working : astraAssets.happy}
      alt="Astra sticker"
    />
  )
}

function AstraMini() {
  return <img className="astra-mini" src={astraAssets.sitting} alt="Small Astra" />
}

function TomatoMascot({
  className = '',
  small = false,
}: {
  className?: string
  small?: boolean
}) {
  return (
    <motion.img
      className={`${className} ${small ? 'tomato-small' : ''}`}
      src={small ? astraAssets.tomato : astraAssets.timerTomato}
      alt="Tomato mascot"
      animate={{ rotate: [0, -2, 2, 0] }}
      transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
}

function StarSticker({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label="Star sticker">
      <path
        d="M58 8l15 31 34 5-25 23 6 34-30-16-30 16 6-34L9 44l34-5L58 8Z"
        fill="#ffca4f"
      />
      <path d="M18 22l5 11 12 2-9 8 2 12-10-6-11 6 2-12-8-8 12-2 5-11Z" fill="#ffca4f" />
      <path d="M100 62l5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2 5-10Z" fill="#ffca4f" />
    </svg>
  )
}

function ClipSticker() {
  return (
    <svg className="clip-sticker" viewBox="0 0 130 96" role="img" aria-label="Clip">
      <path d="M41 52h71v27H30c-14 0-25-11-25-25s11-25 25-25h51c12 0 21 9 21 21s-9 21-21 21H43V51h38c2 0 4-2 4-4s-2-4-4-4H30c-6 0-11 5-11 11s5 11 11 11h82" fill="#a7a7b0" stroke="#5a5a63" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="83" cy="27" r="20" fill="#cfcfd6" stroke="#5a5a63" strokeWidth="5" />
      <circle cx="83" cy="27" r="9" fill="#ececf1" stroke="#8d8d96" strokeWidth="4" />
    </svg>
  )
}

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 74)
    return () => window.clearInterval(interval)
  }, [])

  return now
}

function createInitialEvents(): CalendarEvent[] {
  const today = new Date()
  const tomorrow = new Date(today)
  const soon = new Date(today)
  const nextWeek = new Date(today)

  tomorrow.setDate(today.getDate() + 1)
  soon.setDate(today.getDate() + 4)
  nextWeek.setDate(today.getDate() + 8)

  return [
    {
      id: 1,
      date: dateKey(today),
      time: '10:00',
      title: 'Astra UI polish',
      location: 'home screen',
      tone: 'star',
    },
    {
      id: 2,
      date: dateKey(tomorrow),
      time: '14:30',
      title: 'Pomodoro test',
      location: 'focus room',
      tone: 'tomato',
    },
    {
      id: 3,
      date: dateKey(soon),
      time: '09:15',
      title: 'Notebook polish',
      location: 'notes',
      tone: 'ink',
    },
    {
      id: 4,
      date: dateKey(nextWeek),
      time: '16:00',
      title: 'Astra check-in',
      location: 'calendar',
      tone: 'star',
    },
  ]
}

function getTimeDetails(now: Date) {
  const hours = now.getHours()
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'
  const lunar = solarToVietnameseLunar(now)

  return {
    hour: pad2(hour12),
    minute: pad2(now.getMinutes()),
    second: pad2(now.getSeconds()),
    millisecond: String(now.getMilliseconds()).padStart(3, '0'),
    period,
    timezone,
    weekday: format(now, 'EEEE'),
    fullDate: format(now, 'MMMM d, yyyy'),
    leapYearText: isLeapYear(now.getFullYear())
      ? `${now.getFullYear()} is a leap year`
      : `${now.getFullYear()} is not a leap year`,
    lunarDate: `${lunar.day}/${lunar.month}/${lunar.year}${lunar.isLeap ? ' leap month' : ''}`,
    unixTimestamp: String(Math.floor(now.getTime() / 1000)),
    offset: timezoneOffsetText(now),
  }
}

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${pad2(minutes)}:${pad2(seconds)}`
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function timezoneOffsetText(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absolute = Math.abs(offsetMinutes)

  return `UTC${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`
}

function solarToVietnameseLunar(date: Date) {
  const [day, month, year, isLeap] = convertSolarToLunar(
    date.getDate(),
    date.getMonth() + 1,
    date.getFullYear(),
    VIETNAM_TIMEZONE,
  )

  return {
    day,
    month,
    year,
    isLeap: isLeap === 1,
  }
}

function jdFromDate(day: number, month: number, year: number) {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  let jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045

  if (jd < 2299161) {
    jd =
      day +
      Math.floor((153 * m + 2) / 5) +
      365 * y +
      Math.floor(y / 4) -
      32083
  }

  return jd
}

function getNewMoonDay(k: number, timeZone: number) {
  const time = k / 1236.85
  const time2 = time * time
  const time3 = time2 * time
  const dr = Math.PI / 180
  let jd =
    2415020.75933 +
    29.53058868 * k +
    0.0001178 * time2 -
    0.000000155 * time3

  jd += 0.00033 * Math.sin((166.56 + 132.87 * time - 0.009173 * time2) * dr)

  const meanSun = 359.2242 + 29.10535608 * k - 0.0000333 * time2 - 0.00000347 * time3
  const meanMoon =
    306.0253 + 385.81691806 * k + 0.0107306 * time2 + 0.00001236 * time3
  const moonLatitude =
    21.2964 + 390.67050646 * k - 0.0016528 * time2 - 0.00000239 * time3
  let correction =
    (0.1734 - 0.000393 * time) * Math.sin(meanSun * dr) +
    0.0021 * Math.sin(2 * dr * meanSun) -
    0.4068 * Math.sin(meanMoon * dr) +
    0.0161 * Math.sin(dr * 2 * meanMoon) -
    0.0004 * Math.sin(dr * 3 * meanMoon) +
    0.0104 * Math.sin(dr * 2 * moonLatitude) -
    0.0051 * Math.sin(dr * (meanSun + meanMoon)) -
    0.0074 * Math.sin(dr * (meanSun - meanMoon)) +
    0.0004 * Math.sin(dr * (2 * moonLatitude + meanSun)) -
    0.0004 * Math.sin(dr * (2 * moonLatitude - meanSun)) -
    0.0006 * Math.sin(dr * (2 * moonLatitude + meanMoon)) +
    0.001 * Math.sin(dr * (2 * moonLatitude - meanMoon)) +
    0.0005 * Math.sin(dr * (2 * meanMoon + meanSun))

  const deltaTime =
    time < -11
      ? 0.001 +
        0.000839 * time +
        0.0002261 * time2 -
        0.00000845 * time3 -
        0.000000081 * time * time3
      : -0.000278 +
        0.000265 * time +
        0.000262 * time2

  return Math.floor(jd + correction - deltaTime + 0.5 + timeZone / 24)
}

function getSunLongitude(dayNumber: number, timeZone: number) {
  const time = (dayNumber - 2451545.5 - timeZone / 24) / 36525
  const time2 = time * time
  const dr = Math.PI / 180
  const meanAnomaly =
    357.5291 + 35999.0503 * time - 0.0001559 * time2 - 0.00000048 * time * time2
  const meanLongitude = 280.46645 + 36000.76983 * time + 0.0003032 * time2
  let longitude =
    meanLongitude +
    (1.9146 - 0.004817 * time - 0.000014 * time2) * Math.sin(dr * meanAnomaly) +
    (0.019993 - 0.000101 * time) * Math.sin(2 * dr * meanAnomaly) +
    0.00029 * Math.sin(3 * dr * meanAnomaly)

  longitude *= dr
  longitude -= Math.PI * 2 * Math.floor(longitude / (Math.PI * 2))

  return Math.floor((longitude / Math.PI) * 6)
}

function getLunarMonth11(year: number, timeZone: number) {
  const off = jdFromDate(31, 12, year) - 2415021
  const k = Math.floor(off / 29.530588853)
  let newMoon = getNewMoonDay(k, timeZone)
  const sunLong = getSunLongitude(newMoon, timeZone)

  if (sunLong >= 9) {
    newMoon = getNewMoonDay(k - 1, timeZone)
  }

  return newMoon
}

function getLeapMonthOffset(a11: number, timeZone: number) {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5)
  let last = 0
  let index = 1
  let arc = getSunLongitude(getNewMoonDay(k + index, timeZone), timeZone)

  do {
    last = arc
    index += 1
    arc = getSunLongitude(getNewMoonDay(k + index, timeZone), timeZone)
  } while (arc !== last && index < 14)

  return index - 1
}

function convertSolarToLunar(
  day: number,
  month: number,
  year: number,
  timeZone: number,
) {
  const dayNumber = jdFromDate(day, month, year)
  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853)
  let monthStart = getNewMoonDay(k + 1, timeZone)

  if (monthStart > dayNumber) {
    monthStart = getNewMoonDay(k, timeZone)
  }

  let a11 = getLunarMonth11(year, timeZone)
  let b11 = a11
  let lunarYear: number

  if (a11 >= monthStart) {
    lunarYear = year
    a11 = getLunarMonth11(year - 1, timeZone)
  } else {
    lunarYear = year + 1
    b11 = getLunarMonth11(year + 1, timeZone)
  }

  const lunarDay = dayNumber - monthStart + 1
  const diff = Math.floor((monthStart - a11) / 29)
  let lunarLeap = 0
  let lunarMonth = diff + 11

  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone)

    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10

      if (diff === leapMonthDiff) {
        lunarLeap = 1
      }
    }
  }

  if (lunarMonth > 12) {
    lunarMonth -= 12
  }

  if (lunarMonth >= 11 && diff < 4) {
    lunarYear -= 1
  }

  return [lunarDay, lunarMonth, lunarYear, lunarLeap]
}

export default App
