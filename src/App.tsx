import { Suspense, useEffect, useRef } from 'react'
import { Redirect, Route, Router, Switch } from 'wouter'
import { AiProvider } from './app/ai.tsx'
import { CoachProvider } from './app/coach.tsx'
import { DataProvider, useData } from './app/data.tsx'
import { DraftProvider } from './app/drafts.tsx'
import { useHashLocation, useHashSearch } from './app/hashLocation.ts'
import { I18nProvider, useT } from './app/i18n.tsx'
import { lazyChunk, ScreenBoundary } from './app/lazyChunk.tsx'
import { useTheme } from './app/theme.ts'
import { ToastProvider, useToast } from './app/toast.tsx'
import { CoachBubble, OpenCoach } from './screens/Coach/CoachBubble.tsx'
import { Exercises } from './screens/Exercises/Exercises.tsx'
import { SessionDetail } from './screens/History/SessionDetail.tsx'
import { Log } from './screens/Log/Log.tsx'
import { NotFound } from './screens/NotFound.tsx'
import { Welcome } from './screens/Onboarding/Welcome.tsx'
import { DraftEditor, ProgramEditor } from './screens/Programs/ProgramEditor.tsx'
import { Programs } from './screens/Programs/Programs.tsx'
import { Progress } from './screens/Progress/Progress.tsx'
import { Demo } from './screens/Settings/Demo.tsx'
import { Settings } from './screens/Settings/Settings.tsx'
import { Today } from './screens/Today/Today.tsx'
import { Shell } from './ui/shell/Shell.tsx'

const ReviewExercises = lazyChunk(() =>
  import('./screens/Exercises/ReviewExercises.tsx').then((m) => m.ReviewExercises),
)
// Sync carries the WebRTC and QR code libraries: loaded only when opened.
const Sync = lazyChunk(() => import('./screens/Sync/Sync.tsx').then((m) => m.Sync))
const AiSettings = lazyChunk(() => import('./screens/Settings/AiSettings.tsx').then((m) => m.AiSettings))

function Routes() {
  const { settings } = useData()
  useTheme(settings.theme)
  if (!settings.onboarded) return <Welcome />
  return (
    <Shell>
      <ScreenBoundary>
        <Suspense fallback={null}>
          <Switch>
            <Route path="/" component={Today} />
            <Route path="/log/:id" component={Log} />
            {/* History lives in Progress; older links still land there. */}
            <Route path="/history">
              <Redirect to="/progress?view=history" replace />
            </Route>
            <Route path="/history/:id">{(p) => <Redirect to={`/progress/sessions/${p.id}`} replace />}</Route>
            <Route path="/programs" component={Programs} />
            <Route path="/programs/draft" component={DraftEditor} />
            <Route path="/programs/:id" component={ProgramEditor} />
            <Route path="/progress" component={Progress} />
            <Route path="/progress/sessions/:id" component={SessionDetail} />
            <Route path="/exercises" component={Exercises} />
            <Route path="/exercises/review" component={ReviewExercises} />
            <Route path="/settings" component={Settings} />
            <Route path="/settings/ai" component={AiSettings} />
            {/* The coach opens over any screen; an older link to it lands on Today with it open. */}
            <Route path="/coach" component={OpenCoach} />
            <Route path="/settings/demo" component={Demo} />
            <Route path="/settings/sync" component={Sync} />
            {/* The QR code's link: opening it on the other device starts the sync. */}
            <Route path="/sync" component={Sync} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </ScreenBoundary>
      <CoachBubble />
    </Shell>
  )
}

/** Says so when the browser refused to store a change, rather than letting it look saved. */
function StorageNotice() {
  const { saveFailures } = useData()
  const toast = useToast()
  // Read when a save fails: a change of language alone shows nothing.
  const message = useRef('')
  message.current = useT().shell.storageFull
  useEffect(() => {
    if (saveFailures > 0) toast(message.current)
  }, [saveFailures, toast])
  return null
}

export function App() {
  return (
    <Router hook={useHashLocation} searchHook={useHashSearch}>
      <DataProvider fallback={null}>
        <I18nProvider>
          <AiProvider>
            <DraftProvider>
              <CoachProvider>
                <ToastProvider>
                  <Routes />
                  <StorageNotice />
                </ToastProvider>
              </CoachProvider>
            </DraftProvider>
          </AiProvider>
        </I18nProvider>
      </DataProvider>
    </Router>
  )
}
