# Native landing page styles

Route-specific landing-page CSS belongs here and must be imported only by the
landing route that uses it. Shared public tokens remain in `../storefront.css`.
Do not add these styles to `foundation.css` or `admin.css`. `foundation.css` is
shared by all three surfaces, so anything placed there ships to the admin too.
