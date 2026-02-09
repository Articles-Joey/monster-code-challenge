# Monster Reservations Group Coding Challenge

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Production server

Hosted website is using Firebase App Hosting

## Code Notes

- I went with username and password authentication using a hashed password compare
- Sunglasses on logo when entering password on login screen
- Proxied the form submission through a project API so i can capture the success and save the form details. This prevents multiple submissions from the user, and allows them to self verify and update details.
- Took it upon myself to make the max numOfGuests 67 💀🤷🤷‍♂️