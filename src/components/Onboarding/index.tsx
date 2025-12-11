/**
 * Onboarding 组件
 * 
 * 首次启动引导流程
 */

import { useState, useEffect, useCallback } from 'react'
import { WelcomeStep } from './WelcomeStep'
import { PermissionsStep } from './PermissionsStep'
import { ModelStep } from './ModelStep'
import { CompleteStep } from './CompleteStep'

type OnboardingStepType = 'welcome' | 'permissions' | 'model' | 'complete'

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStepType>('welcome')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadState = async () => {
      try {
        const state = await window.onboarding.getState()
        if (state.completed) {
          onComplete()
          return
        }
        setCurrentStep(state.currentStep as OnboardingStepType)
      } catch (error) {
        console.error('加载 Onboarding 状态失败:', error)
      } finally {
        setLoading(false)
      }
    }
    loadState()
  }, [onComplete])

  const goToStep = useCallback((step: OnboardingStepType) => {
    setCurrentStep(step)
  }, [])

  const handleStepComplete = useCallback(async (step: string) => {
    await window.onboarding.completeStep(step)
  }, [])

  const handleSkip = useCallback(async () => {
    await window.onboarding.skip()
    onComplete()
  }, [onComplete])

  const handleFinish = useCallback(async () => {
    await window.onboarding.finish()
    onComplete()
  }, [onComplete])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">正在加载...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-slate-50 overflow-y-auto">
      {currentStep === 'welcome' && (
        <WelcomeStep
          onNext={() => {
            handleStepComplete('welcome')
            goToStep('permissions')
          }}
          onSkip={handleSkip}
        />
      )}
      {currentStep === 'permissions' && (
        <PermissionsStep
          onNext={() => {
            handleStepComplete('permissions')
            goToStep('model')
          }}
          onBack={() => goToStep('welcome')}
          onSkip={handleSkip}
        />
      )}
      {currentStep === 'model' && (
        <ModelStep
          onNext={() => {
            handleStepComplete('model')
            goToStep('complete')
          }}
          onBack={() => goToStep('permissions')}
          onSkip={handleSkip}
        />
      )}
      {currentStep === 'complete' && (
        <CompleteStep onFinish={handleFinish} />
      )}
    </div>
  )
}

export default Onboarding
