import { Head } from '@inertiajs/react'
import { RoomRail } from '@/components/layout/RoomRail'
import { DMSidebar } from '@/components/layout/DMSidebar'
import { NotificationFeed } from '@/components/messages/NotificationFeed'
import type { SharedProps } from '@/types'

export default function DMIndex({ auth, rooms, conversations, recentCustomStatuses }: SharedProps) {
    return (
        <>
            <Head title="Messages" />

            <div className="flex flex-col h-screen">
                <RoomRail rooms={rooms} currentUserId={auth.user.id} />

                <div className="flex flex-1 min-h-0">
                    <DMSidebar conversations={conversations} currentUser={auth.user} recentCustomStatuses={recentCustomStatuses} />

                    <NotificationFeed userId={auth.user.id} />
                </div>
            </div>
        </>
    )
}
