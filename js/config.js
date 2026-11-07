// إعدادات الموقع. كلمات السر مش مكتوبة هنا، المحفوظ هو بصمة PBKDF2 فقط.
export const CONFIG = {
  companyName: 'شركة السندس كاربت لصناعة و نسج السجاد الفاخر',
  shortName: 'السندس كاربت',
  dataFile: 'production.xlsx',
  targets: { 1: 36, 2: 32, 3: 41 },     // الإنتاج المستهدف لكل وردية
  shiftMinutes: 480,
  iterations: 150000,
  // لو الموقع مش على github.io اكتب الريبو هنا، مثال: { owner: 'name', repo: 'sondos-site', branch: 'main' }
  repo: null,
  users: [
    {
        "user": "Sondos User",
        "role": "viewer",
        "label": "مستخدم العرض",
        "salt": "ea2b44786a4568ba22eed75019a309f3",
        "hash": "1c8bbccec3642711417296ba3d29fab909494afc1984ec0d6b0699d804fd7988"
    },
    {
        "user": "Alucard",
        "role": "owner",
        "label": "مدير النظام",
        "salt": "a37389f27d7eb1549ca98a95ed5508e9",
        "hash": "a7c65d797e8116ba1c77229f7e8fb844fab1fd077c4581642c29c68e1137fb36"
    }
],
};
