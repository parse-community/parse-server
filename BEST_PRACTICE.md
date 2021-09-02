# Best Practice <!-- omit in toc -->

- [Security](#security)
  - [Firewall](#firewall)
- [Optimization](#optimization)
  - [Database](#database)
  - [Queries](#queries)

*This page is a work in progress and by no means complete. If you have any suggestions, please open a PR to extend the list.*

## Security

### Firewall

Protect all Parse Server endpoints using a Firewall. For example, rate-limiting the number of requests per IP address can mitigate the risk of malicious attempts to scape user data, flood your database and simple DDoS attacks.

## Optimization

The following is a list of design considerations to optimize data traffic.

### Database

- Use short field names; field names need to be stored in the database just like the field values; short field names not only require less database storage but also reduce the data traffic between database, server and client.

### Queries

- Use `select` and `exclude` to transfer only the fields that you need instead of the whole object.