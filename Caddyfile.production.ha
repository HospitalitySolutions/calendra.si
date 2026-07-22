(backend_cluster) {
	reverse_proxy backend-a:4000 backend-b:4000 {
		lb_policy least_conn
		lb_try_duration 5s
		lb_try_interval 250ms
		health_uri /api/actuator/health/readiness
		health_interval 10s
		health_timeout 3s
		fail_duration 30s
		max_fails 3
		header_up X-Forwarded-Proto https
	}
}

app.calendra.si {
	encode gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://assets.mediadelivery.net https://challenges.cloudflare.com; connect-src 'self' https: wss:; frame-src 'self' https://challenges.cloudflare.com https://iframe.mediadelivery.net https://*.mediadelivery.net https://*.zoom.us; child-src 'self' https://challenges.cloudflare.com https://iframe.mediadelivery.net https://*.mediadelivery.net https://*.zoom.us; media-src 'self' blob: data: https:; frame-ancestors 'self' https://*.zoom.us;"
	}

	handle /api/* {
		import backend_cluster
	}

	handle /oauth2/* {
		import backend_cluster
	}

	handle /login/oauth2/* {
		import backend_cluster
	}

	handle /widget/* {
		import backend_cluster
	}

	handle {
		reverse_proxy frontend:80 {
			header_up X-Forwarded-Proto https
		}
	}
}

www.calendra.si {
	redir https://calendra.si{uri} permanent
}

calendra.si {
	encode gzip

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}

	# Existing demo confirmation emails point to the public-site URL.
	# Redirect management links to the app frontend, which owns the
	# reschedule/cancel page and calls the public demo-booking API.
	redir /predstavitev/upravljanje/* https://app.calendra.si{uri} temporary
	redir /en/demo/manage/* https://app.calendra.si{uri} temporary

	handle /narocanje/* {
		uri replace /narocanje/ /widget/
		import backend_cluster
	}

	handle /widget/* {
		import backend_cluster
	}

	handle /api/public/widget/* {
		import backend_cluster
	}

	handle {
		reverse_proxy host.docker.internal:8080
	}
}
