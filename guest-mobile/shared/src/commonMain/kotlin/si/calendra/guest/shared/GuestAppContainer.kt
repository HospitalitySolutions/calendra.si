package si.calendra.guest.shared

import si.calendra.guest.shared.config.GuestApiConfig
import si.calendra.guest.shared.network.HttpClientFactory
import si.calendra.guest.shared.network.RemoteGuestApi
import si.calendra.guest.shared.repository.GuestRepository
import si.calendra.guest.shared.repository.PreviewGuestRepository
import si.calendra.guest.shared.repository.RemoteGuestRepository

class GuestAppContainer(
    val config: GuestApiConfig = GuestApiConfig()
) {
    val repository: GuestRepository by lazy {
        if (config.usePreviewData) {
            PreviewGuestRepository()
        } else {
            RemoteGuestRepository(RemoteGuestApi(config, HttpClientFactory.create()))
        }
    }
}
