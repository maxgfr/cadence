import { lazy, Suspense } from 'react'
import { Route, Router, Switch } from 'wouter'
import { AiProvider } from './app/ai.tsx'
import { DataProvider, useData } from './app/data.tsx'
import { DraftProvider } from './app/drafts.tsx'
import { useHashLocation, useHashSearch } from './app/hashLocation.ts'
import { useTheme } from './app/theme.ts'
import { ToastProvider } from './app/toast.tsx'
import { Exercises } from './screens/Exercises/Exercises.tsx'
import { History } from './screens/History/History.tsx'
import { SessionDetail } from './screens/History/SessionDetail.tsx'
import { Log } from './screens/Log/Log.tsx'
import { NotFound } from './screens/NotFound.tsx'
import { Welcome } from './screens/Onboarding/Welcome.tsx'
import { DraftEditor, ProgramEditor } from './screens/Programs/ProgramEditor.tsx'
import { Programs } from './screens/Programs/Programs.tsx'
import { Templates } from './screens/Programs/Templates.tsx'
import { Progress } from './screens/Progress/Progress.tsx'
import { Settings } from './screens/Settings/Settings.tsx'
import { Today } from './screens/Today/Today.tsx'
import { Shell } from './ui/shell/Shell.tsx'

// The AI screens carry the provider SDKs: loaded only when opened.
const Generate = lazy(() => import('./screens/Programs/Generate.tsx').then((m) => ({ default: m.Generate })))
const AiSettings = lazy(() => import('./screens/Settings/AiSettings.tsx').then((m) => ({ default: m.AiSettings })))

function Routes() {
  const { settings } = useData()
  useTheme(settings.theme)
  if (!settings.onboarded) return <Welcome />
  return (
    <Shell>
      <Suspense fallback={null}>
        <Switch>
          <Route path="/" component={Today} />
          <Route path="/log/:id" component={Log} />
          <Route path="/history" component={History} />
          <Route path="/history/:id" component={SessionDetail} />
          <Route path="/programs" component={Programs} />
          <Route path="/programs/templates" component={Templates} />
          <Route path="/programs/generate" component={Generate} />
          <Route path="/programs/draft" component={DraftEditor} />
          <Route path="/programs/:id" component={ProgramEditor} />
          <Route path="/progress" component={Progress} />
          <Route path="/exercises" component={Exercises} />
          <Route path="/settings" component={Settings} />
          <Route path="/settings/ai" component={AiSettings} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Shell>
  )
}

export function App() {
  return (
    <Router hook={useHashLocation} searchHook={useHashSearch}>
      <DataProvider fallback={null}>
        <AiProvider>
          <DraftProvider>
            <ToastProvider>
              <Routes />
            </ToastProvider>
          </DraftProvider>
        </AiProvider>
      </DataProvider>
    </Router>
  )
}
