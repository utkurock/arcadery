import { Gamepad2, Layers, Users, DollarSign } from 'lucide-react'
import { type ReactNode } from 'react'

interface FeaturesProps {
    dark?: boolean
}

export function Features({ dark = false }: FeaturesProps) {
    return (
        <section className="py-16 md:py-32">
            <div className="mx-auto max-w-2xl px-6 lg:max-w-5xl">
                <div className="mb-16 text-center">
                    <h2 className={`text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>
                        Everything you need to go
                        <br />
                        from{' '}
                        <span className="relative inline-block">
                            Idea to Web3 Game
                            <svg className="absolute -bottom-3 left-0 w-full" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                                <path d="M2 8.5C30 3 60 5 100 6.5C140 8 170 4 198 7" stroke="#8b7ec8" strokeWidth="3" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 4px rgba(139, 126, 200, 0.4))' }} />
                            </svg>
                        </span>
                    </h2>
                    <p className={`mx-auto mt-4 max-w-2xl text-base ${dark ? 'text-white/50' : 'text-[#565c65]'}`}>
                        Prompt your game idea, AI builds it. Set up your token economy, publish, and start earning — no code required.
                    </p>
                </div>

                <div className="mx-auto grid gap-4 lg:grid-cols-2">
                    {/* Card 1 - AI Game Builder */}
                    <FeatureCard dark={dark}>
                        <div className="p-6 pb-3">
                            <CardHeading
                                icon={<Gamepad2 className="size-4" />}
                                title="AI Game Builder"
                                description="Describe your idea, get a playable game. AI handles the rest."
                                dark={dark}
                            />
                        </div>
                        <div className="relative mb-6 border-t border-dashed sm:mb-0" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : '#e5e5e5' }}>
                            <div className={`absolute inset-0 ${dark ? '[background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,rgba(30,30,40,0.8),rgb(10,10,15)_125%)]' : '[background:radial-gradient(125%_125%_at_50%_0%,transparent_40%,#f5f5f5,white_125%)]'}`} />
                            <div className="aspect-[76/59] overflow-hidden p-1 px-6">
                                <img
                                    src="/drift-racer.png"
                                    alt="AI game builder"
                                    className="h-full w-full rounded object-cover object-center scale-[2.2] origin-center"
                                    width={2940}
                                    height={1912}
                                />
                            </div>
                        </div>
                    </FeatureCard>

                    {/* Card 2 - Drag & Drop Editor */}
                    <FeatureCard dark={dark}>
                        <div className="p-6 pb-3">
                            <CardHeading
                                icon={<Layers className="size-4" />}
                                title="Token Economy Editor"
                                description="Configure tokenomics, tournaments, and revenue splits in a few clicks."
                                dark={dark}
                            />
                        </div>
                        <div className="p-6 pt-0">
                            <div className="relative mb-6 sm:mb-0">
                                <div className={`absolute -inset-6 ${dark ? '[background:radial-gradient(50%_50%_at_75%_50%,transparent,rgb(10,10,15)_100%)]' : '[background:radial-gradient(50%_50%_at_75%_50%,transparent,#f8f8fa_100%)]'}`} />
                                <div className="aspect-[76/59] overflow-hidden border" style={{ borderColor: dark ? 'rgba(255,255,255,0.1)' : '#e5e5e5' }}>
                                    <img
                                        src="/scene-editor.png"
                                        alt="Token Economy Editor"
                                        className="h-full w-full object-cover"
                                        width={1598}
                                        height={1420}
                                    />
                                </div>
                            </div>
                        </div>
                    </FeatureCard>

                    {/* Card 3 - Full width */}
                    <FeatureCard dark={dark} className="p-6 lg:col-span-2">
                        <p className={`mx-auto my-6 max-w-md text-balance text-center text-2xl font-semibold ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>
                            Prompt → Build → Share → Earn. The complete Web3 game pipeline.
                        </p>

                        <div className="flex justify-center gap-6 overflow-hidden">
                            <CircularUI label="Prompt" variant="border" dark={dark} />
                            <CircularUI label="Build" variant="primary" dark={dark} />
                            <CircularUI label="Share" variant="blue" dark={dark} />
                            <CircularUI label="Earn" variant="primary" dark={dark} className="hidden sm:block" />
                        </div>
                    </FeatureCard>
                </div>
            </div>
        </section>
    )
}

const FeatureCard = ({ children, className, dark }: { children: ReactNode; className?: string; dark?: boolean }) => (
    <div className={`group relative shadow-sm ${dark ? 'border border-white/10 bg-white/[0.04]' : 'border border-[#e5e5e5] bg-white'} ${className ?? ''}`}>
        <span className={`absolute -left-px -top-px block size-2 border-l-2 border-t-2 ${dark ? 'border-[#8b7ec8]' : 'border-[#1b1b1b]'}`} />
        <span className={`absolute -right-px -top-px block size-2 border-r-2 border-t-2 ${dark ? 'border-[#8b7ec8]' : 'border-[#1b1b1b]'}`} />
        <span className={`absolute -bottom-px -left-px block size-2 border-b-2 border-l-2 ${dark ? 'border-[#8b7ec8]' : 'border-[#1b1b1b]'}`} />
        <span className={`absolute -bottom-px -right-px block size-2 border-b-2 border-r-2 ${dark ? 'border-[#8b7ec8]' : 'border-[#1b1b1b]'}`} />
        {children}
    </div>
)

const CardHeading = ({ icon, title, description, dark }: { icon: ReactNode; title: string; description: string; dark?: boolean }) => (
    <div className="p-6">
        <span className={`flex items-center gap-2 ${dark ? 'text-white/50' : 'text-[#565c65]'}`}>
            {icon}
            {title}
        </span>
        <p className={`mt-8 text-2xl font-semibold ${dark ? 'text-white' : 'text-[#1b1b1b]'}`}>{description}</p>
    </div>
)

const CircularUI = ({ label, variant, dark, className }: { label: string; variant: 'border' | 'primary' | 'blue'; dark?: boolean; className?: string }) => {
    const borderColor = dark ? 'rgba(255,255,255,0.15)' : '#e5e5e5'
    const circleStyles: Record<string, string> = {
        border: `border rounded-full size-7 sm:size-8 ${dark ? 'border-[#8b7ec8]' : 'border-[#1b1b1b]'} bg-[repeating-linear-gradient(-45deg,${dark ? 'rgba(255,255,255,0.15)' : '#e5e5e5'},${dark ? 'rgba(255,255,255,0.15)' : '#e5e5e5'}_1px,transparent_1px,transparent_4px)]`,
        primary: `border rounded-full size-7 sm:size-8 ${dark ? 'border-[#8b7ec8]' : 'border-[#1b1b1b]'}`,
        blue: `border rounded-full size-7 sm:size-8 border-blue-500`,
    }

    return (
        <div className={className}>
            <div className="size-fit rounded-2xl p-px" style={{ background: `linear-gradient(to bottom, ${borderColor}, transparent)` }}>
                <div className={`relative flex aspect-square w-fit items-center -space-x-4 rounded-[15px] p-4 ${dark ? 'bg-[#12121a]' : 'bg-[#fafafa]'}`}>
                    <div className={circleStyles[variant]} />
                    <div className={circleStyles[variant]} />
                </div>
            </div>
            <span className={`mt-1.5 block text-center text-sm ${dark ? 'text-white/40' : 'text-[#919191]'}`}>{label}</span>
        </div>
    )
}
